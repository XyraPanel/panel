import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { serverManager } from '#server/utils/server-manager';
import { backupManager } from '#server/utils/backup-manager';
import { recordAuditEvent } from '#server/utils/audit';
import { randomUUID } from 'node:crypto';
import type {
  ScheduleTask,
  ScheduleInfo,
  TaskExecutionResult,
  ScheduleExecutionResult,
  TaskAction,
  PowerAction,
} from '#shared/types/server';

export class TaskScheduler {
  private db = useDrizzle();
  private runningTasks = new Map<string, boolean>();
  private isProcessingQueue = false;

  private parseCronField(field: string): number | null {
    if (!field || field === '*' || field.startsWith('*/')) return null;
    const val = parseInt(field);
    return isNaN(val) ? null : val;
  }

  private parseNextRun(cronExpression: string, lastRun?: Date): Date {
    const base = lastRun ? new Date(lastRun.getTime() + 60000) : new Date();
    const parts = cronExpression.trim().split(/\s+/);
    const [mf = '*', hf = '*', df = '*', monf = '*', wdf = '*'] = parts;

    const targetMinute = this.parseCronField(mf);
    const targetHour = this.parseCronField(hf);
    const targetDay = this.parseCronField(df);
    const targetMonth = this.parseCronField(monf);
    const targetWeekday = this.parseCronField(wdf);

    const nextRun = new Date(base);
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);
    nextRun.setMinutes(nextRun.getMinutes() + 1);

    for (let i = 0; i < 60 * 24 * 366; i++) {
      const ok =
        (targetMinute === null || nextRun.getMinutes() === targetMinute) &&
        (targetHour === null || nextRun.getHours() === targetHour) &&
        (targetDay === null || nextRun.getDate() === targetDay) &&
        (targetMonth === null || nextRun.getMonth() === targetMonth - 1) &&
        (targetWeekday === null || nextRun.getDay() === targetWeekday);
      if (ok) return nextRun;
      nextRun.setMinutes(nextRun.getMinutes() + 1);
    }

    const fallback = new Date(base);
    fallback.setMinutes(fallback.getMinutes() + 1);
    fallback.setSeconds(0);
    fallback.setMilliseconds(0);
    return fallback;
  }

  private isCronDue(cronExpression: string, now: Date): boolean {
    const [minute = '*', hour = '*', day = '*', month = '*', weekday = '*'] = cronExpression
      .trim()
      .split(/\s+/);

    const nowMinute = now.getMinutes();
    const nowHour = now.getHours();
    const nowDay = now.getDate();
    const nowMonth = now.getMonth() + 1;
    const nowDayOfWeek = now.getDay();

    const equals = (token: string | undefined, value: number) => {
      if (!token || token === '*') {
        return true;
      }

      if (token.startsWith('*/')) {
        const step = Number.parseInt(token.slice(2), 10);
        return !Number.isNaN(step) && step > 0 && value % step === 0;
      }

      const parsed = Number.parseInt(token, 10);
      if (Number.isNaN(parsed)) {
        return false;
      }

      return parsed === value;
    };

    if (!equals(minute, nowMinute)) return false;
    if (!equals(hour, nowHour)) return false;
    if (!equals(day, nowDay)) return false;
    if (!equals(month, nowMonth)) return false;
    if (!equals(weekday, nowDayOfWeek)) return false;

    return true;
  }

  async executeScheduledTask(scheduleId: string, taskId: string): Promise<TaskExecutionResult> {
    const executedAt = new Date();

    try {
      const [task] = await this.db
        .select()
        .from(tables.serverScheduleTasks)
        .where(eq(tables.serverScheduleTasks.id, taskId))
        .limit(1);

      if (!task) {
        throw new Error('Task not found');
      }

      const [schedule] = await this.db
        .select()
        .from(tables.serverSchedules)
        .where(eq(tables.serverSchedules.id, scheduleId))
        .limit(1);

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      const [server] = await this.db
        .select()
        .from(tables.servers)
        .where(eq(tables.servers.id, schedule.serverId))
        .limit(1);

      if (!server) {
        throw new Error('Server not found');
      }

      const serverUuid = server.uuid;
      if (!serverUuid) {
        throw new Error('Server missing UUID');
      }

      let output: string | undefined;

      switch (task.action) {
        case 'command': {
          const { client } = await getWingsClientForServer(serverUuid);
          await client.sendCommand(serverUuid, task.payload ?? '');
          output = `Command executed: ${task.payload}`;
          break;
        }

        case 'power': {
          const powerAction = (task.payload ?? '') as PowerAction;
          await serverManager.powerAction(serverUuid, powerAction, { skipAudit: true });
          output = `Power action executed: ${powerAction}`;
          break;
        }

        case 'backup': {
          const backupName = task.payload || `scheduled-backup-${Date.now()}`;
          await backupManager.createBackup(serverUuid, {
            name: backupName,
            skipAudit: true,
          });
          output = `Backup created: ${backupName}`;
          break;
        }

        default:
          throw new Error(`Unknown task action: ${task.action}`);
      }

      return {
        taskId,
        success: true,
        output,
        executedAt,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        taskId,
        success: false,
        error: errorMessage,
        executedAt,
      };
    }
  }

  async executeSchedule(
    scheduleId: string,
    force: boolean = false,
  ): Promise<ScheduleExecutionResult> {
    if (this.runningTasks.has(scheduleId)) {
      throw new Error('Schedule is already running');
    }

    this.runningTasks.set(scheduleId, true);
    const executedAt = new Date();
    const taskResults: TaskExecutionResult[] = [];
    let scheduleSuccess = true;

    try {
      const [schedule] = await this.db
        .select()
        .from(tables.serverSchedules)
        .where(eq(tables.serverSchedules.id, scheduleId))
        .limit(1);

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      if (!schedule.enabled && !force) {
        throw new Error('Schedule is disabled');
      }

      const tasks = await this.db
        .select()
        .from(tables.serverScheduleTasks)
        .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
        .orderBy(tables.serverScheduleTasks.sequenceId);

      for (const task of tasks) {
        if (task.timeOffset > 0) {
          await new Promise((resolve) => setTimeout(resolve, task.timeOffset * 1000));
        }

        const result = await this.executeScheduledTask(scheduleId, task.id);
        taskResults.push(result);

        if (!result.success) {
          scheduleSuccess = false;
          if (!task.continueOnFailure) {
            break;
          }
        }
      }

      const nextRun = this.parseNextRun(schedule.cron, executedAt);
      await this.db
        .update(tables.serverSchedules)
        .set({
          lastRunAt: executedAt.toISOString(),
          nextRunAt: nextRun.toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.serverSchedules.id, scheduleId));

      return {
        scheduleId,
        success: scheduleSuccess,
        tasks: taskResults,
        executedAt,
      };
    } finally {
      this.runningTasks.delete(scheduleId);
    }
  }

  async processScheduledTasks(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;
    const now = new Date();

    try {
      const schedules = await this.db
        .select()
        .from(tables.serverSchedules)
        .where(eq(tables.serverSchedules.enabled, true));

      for (const schedule of schedules) {
        if (this.isCronDue(schedule.cron, now)) {
          try {
            await this.executeSchedule(schedule.id);
          } catch (error) {
            console.error(`Schedule ${schedule.id} failed:`, error);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async createSchedule(
    serverId: string,
    name: string,
    cron: string,
    tasks: Omit<ScheduleTask, 'id'>[],
    userId?: string,
  ): Promise<ScheduleInfo> {
    const scheduleId = randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const nextRun = this.parseNextRun(cron);

    await this.db.insert(tables.serverSchedules).values({
      id: scheduleId,
      serverId,
      name,
      cron,
      action: 'task',
      nextRunAt: nextRun.toISOString(),
      lastRunAt: null,
      enabled: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const taskRecords = tasks.map((task, index) => ({
      id: randomUUID(),
      scheduleId,
      sequenceId: task.sequenceId || index + 1,
      action: task.action,
      payload: task.payload,
      timeOffset: task.timeOffset || 0,
      continueOnFailure: task.continueOnFailure || false,
      isQueued: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    for (const taskRecord of taskRecords) {
      await this.db.insert(tables.serverScheduleTasks).values(taskRecord);
    }

    if (userId) {
      await recordAuditEvent({
        actor: userId,
        actorType: 'user',
        action: 'server.schedule.create',
        targetType: 'server',
        targetId: serverId,
        metadata: { scheduleId, name, cron, taskCount: tasks.length },
      });
    }

    const [server] = await this.db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.id, serverId))
      .limit(1);

    return {
      id: scheduleId,
      serverId,
      serverUuid: server?.uuid || '',
      name,
      cron,
      enabled: true,
      nextRunAt: nextRun.toISOString(),
      lastRunAt: undefined,
      tasks: taskRecords.map((t) => ({
        id: t.id,
        action: t.action as TaskAction,
        payload: t.payload,
        timeOffset: t.timeOffset,
        sequenceId: t.sequenceId,
        continueOnFailure: t.continueOnFailure,
        isQueued: t.isQueued,
      })),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  async deleteSchedule(scheduleId: string, userId?: string): Promise<void> {
    const [schedule] = await this.db
      .select()
      .from(tables.serverSchedules)
      .where(eq(tables.serverSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await this.db
      .delete(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId));

    await this.db.delete(tables.serverSchedules).where(eq(tables.serverSchedules.id, scheduleId));

    if (userId) {
      await recordAuditEvent({
        actor: userId,
        actorType: 'user',
        action: 'server.schedule.delete',
        targetType: 'server',
        targetId: schedule.serverId,
        metadata: { scheduleId, name: schedule.name },
      });
    }
  }

  async getSchedule(scheduleId: string): Promise<ScheduleInfo | null> {
    const [schedule] = await this.db
      .select()
      .from(tables.serverSchedules)
      .where(eq(tables.serverSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) {
      return null;
    }

    const tasks = await this.db
      .select()
      .from(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
      .orderBy(tables.serverScheduleTasks.sequenceId);

    const [server] = await this.db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.id, schedule.serverId))
      .limit(1);

    return {
      id: schedule.id,
      serverId: schedule.serverId,
      serverUuid: server?.uuid || '',
      name: schedule.name,
      cron: schedule.cron,
      enabled: schedule.enabled,
      nextRunAt: schedule.nextRunAt || undefined,
      lastRunAt: schedule.lastRunAt || undefined,
      tasks: tasks.map((t) => ({
        id: t.id,
        action: t.action as TaskAction,
        payload: t.payload ?? '',
        timeOffset: t.timeOffset,
        sequenceId: t.sequenceId,
        continueOnFailure: t.continueOnFailure,
        isQueued: t.isQueued,
      })),
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  async listSchedules(serverId?: string): Promise<ScheduleInfo[]> {
    const query = this.db.select().from(tables.serverSchedules);

    if (serverId) {
      query.where(eq(tables.serverSchedules.serverId, serverId));
    }

    const schedules = await query.orderBy(tables.serverSchedules.createdAt);

    const results: ScheduleInfo[] = [];
    for (const schedule of schedules) {
      const scheduleInfo = await this.getSchedule(schedule.id);
      if (scheduleInfo) {
        results.push(scheduleInfo);
      }
    }

    return results;
  }

  async toggleSchedule(scheduleId: string, enabled: boolean, userId?: string): Promise<void> {
    const [schedule] = await this.db
      .select()
      .from(tables.serverSchedules)
      .where(eq(tables.serverSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await this.db
      .update(tables.serverSchedules)
      .set({
        enabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.serverSchedules.id, scheduleId));

    if (userId) {
      await recordAuditEvent({
        actor: userId,
        actorType: 'user',
        action: enabled ? 'server.schedule.enable' : 'server.schedule.disable',
        targetType: 'server',
        targetId: schedule.serverId,
        metadata: { scheduleId, name: schedule.name },
      });
    }
  }

  startScheduler(): void {
    console.log('Starting task scheduler...');

    setInterval(() => {
      this.processScheduledTasks().catch((error) => {
        console.error('Scheduled task processing failed:', error);
      });
    }, 60000);
  }

  stopScheduler(): void {
    console.log('Stopping task scheduler...');
    this.runningTasks.clear();
  }
}

export const taskScheduler = new TaskScheduler();

export async function executeScheduledTask(scheduleId: string, taskId: string): Promise<void> {
  await taskScheduler.executeScheduledTask(scheduleId, taskId);
}

export async function processScheduledTasks(): Promise<void> {
  await taskScheduler.processScheduledTasks();
}
