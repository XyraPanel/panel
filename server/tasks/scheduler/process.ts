import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { serverManager } from '#server/utils/server-manager';
import { backupManager } from '#server/utils/backup-manager';
import { recordAuditEvent } from '#server/utils/audit';
import { debugLog, debugError } from '#server/utils/logger';

function matchesCronField(field: string, value: number): boolean {
  if (!field || field === '*') return true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    if (isNaN(step) || step <= 0) return true;
    return value % step === 0;
  }
  const exact = parseInt(field);
  return !isNaN(exact) && value === exact;
}

function parseNextRun(cronExpression: string, fromDate?: Date): Date {
  const now = fromDate || new Date();
  const parts = cronExpression.trim().split(/\s+/);
  const [mf = '*', hf = '*', df = '*', monf = '*', wdf = '*'] = parts;

  const nextRun = new Date(now);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);
  nextRun.setMinutes(nextRun.getMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 366; i++) {
    const ok =
      matchesCronField(mf, nextRun.getMinutes()) &&
      matchesCronField(hf, nextRun.getHours()) &&
      matchesCronField(df, nextRun.getDate()) &&
      matchesCronField(monf, nextRun.getMonth() + 1) &&
      matchesCronField(wdf, nextRun.getDay());
    if (ok) return nextRun;
    nextRun.setMinutes(nextRun.getMinutes() + 1);
  }

  return nextRun;
}

export default defineTask({
  meta: {
    name: 'scheduler:process',
    description: 'Process scheduled server tasks',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle();
    const now = new Date();
    const processedSchedules: string[] = [];
    const errors: string[] = [];

    try {
      debugLog(`[${now.toISOString()}] Processing scheduled tasks...`);

      const schedules = await db.query.serverSchedules.findMany({
        where: (s, { eq: whereEq }) => whereEq(s.enabled, true),
      });

      for (const schedule of schedules) {
        try {
          const nextRunAt = schedule.nextRunAt ? new Date(schedule.nextRunAt) : null;

          if (!nextRunAt) {
            const initialNextRun = parseNextRun(schedule.cron, now);
            await db
              .update(tables.serverSchedules)
              .set({ nextRunAt: initialNextRun.toISOString() })
              .where(eq(tables.serverSchedules.id, schedule.id));
            continue;
          }

          if (nextRunAt <= now) {
            await processSchedule(schedule.id, db);
            processedSchedules.push(schedule.id);
          }
        } catch (scheduleError) {
          const errorMsg = `Schedule ${schedule.id} failed: ${scheduleError instanceof Error ? scheduleError.message : 'Unknown error'}`;
          debugError(errorMsg);
          errors.push(errorMsg);
        }
      }

      const result = {
        processedAt: now.toISOString(),
        schedulesProcessed: processedSchedules.length,
        totalSchedules: schedules.length,
        errors: errors.length,
        processedScheduleIds: processedSchedules,
      };

      debugLog(`[${now.toISOString()}] Task processing complete:`, result);
      return { result };
    } catch (error) {
      const errorMsg = `Scheduler task failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  },
});

async function processSchedule(scheduleId: string, db: ReturnType<typeof useDrizzle>) {
  const runningTasks = new Map<string, boolean>();

  if (runningTasks.has(scheduleId)) {
    debugLog(`Schedule ${scheduleId} is already running, skipping...`);
    return;
  }

  runningTasks.set(scheduleId, true);
  const executedAt = new Date();

  try {
    const schedule = await db.query.serverSchedules.findFirst({
      where: (s, { eq: whereEq }) => whereEq(s.id, scheduleId),
    });

    if (!schedule || !schedule.enabled) {
      return;
    }

    const tasks = await db.query.serverScheduleTasks.findMany({
      where: (t, { eq: whereEq }) => whereEq(t.scheduleId, scheduleId),
      orderBy: (t, { asc }) => [asc(t.sequenceId)],
    });

    if (tasks.length === 0) {
      debugLog(`No tasks found for schedule ${scheduleId}`);
      return;
    }

    const server = await db.query.servers.findFirst({
      where: (s, { eq: whereEq }) => whereEq(s.id, schedule.serverId),
    });

    if (!server) {
      throw new Error('Server not found');
    }

    debugLog(
      `Executing ${tasks.length} tasks for schedule "${schedule.name}" on server ${server.uuid}`,
    );

    let allTasksSucceeded = true;

    for (const task of tasks) {
      if (task.timeOffset > 0) {
        debugLog(`Waiting ${task.timeOffset}s before executing task ${task.id}`);
        await new Promise((resolve) => setTimeout(resolve, task.timeOffset * 1000));
      }

      try {
        await executeTask(task, server, schedule);
        debugLog(`Task ${task.id} (${task.action}) completed successfully`);
      } catch (taskError) {
        const errorMsg = `Task ${task.id} failed: ${taskError instanceof Error ? taskError.message : 'Unknown error'}`;
        console.error(errorMsg);
        allTasksSucceeded = false;

        if (!task.continueOnFailure) {
          debugLog(`Task ${task.id} failed and continueOnFailure is false, stopping execution`);
          break;
        }
      }
    }

    const nextRun = parseNextRun(schedule.cron);

    await db
      .update(tables.serverSchedules)
      .set({
        lastRunAt: executedAt.toISOString(),
        nextRunAt: nextRun.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.serverSchedules.id, scheduleId));

    debugLog(
      `Schedule ${scheduleId} completed (success: ${allTasksSucceeded}). Next run: ${nextRun.toISOString()}`,
    );
  } finally {
    runningTasks.delete(scheduleId);
  }
}

async function executeTask(
  task: typeof tables.serverScheduleTasks.$inferSelect,
  server: typeof tables.servers.$inferSelect,
  schedule: typeof tables.serverSchedules.$inferSelect,
) {
  const isPowerAction = (
    value: string | null | undefined,
  ): value is 'start' | 'stop' | 'restart' | 'kill' =>
    value === 'start' || value === 'stop' || value === 'restart' || value === 'kill';

  switch (task.action) {
    case 'command': {
      const { client } = await getWingsClientForServer(server.uuid);
      await client.sendCommand(server.uuid, task.payload || '');
      debugLog(`Command executed on ${server.uuid}: ${task.payload}`);
      break;
    }

    case 'power': {
      if (!isPowerAction(task.payload)) {
        throw new Error(`Invalid power action payload: ${task.payload ?? 'undefined'}`);
      }
      const powerAction = task.payload;
      await serverManager.powerAction(server.uuid, powerAction, { skipAudit: true });
      debugLog(`Power action executed on ${server.uuid}: ${powerAction}`);
      break;
    }

    case 'backup': {
      const backupName = task.payload || `scheduled-backup-${Date.now()}`;
      await backupManager.createBackup(server.uuid, {
        name: backupName,
        skipAudit: true,
      });
      debugLog(`Backup created for ${server.uuid}: ${backupName}`);
      break;
    }

    default:
      throw new Error(`Unknown task action: ${task.action}`);
  }

  await recordAuditEvent({
    actor: 'system',
    actorType: 'system',
    action: `schedule.task.${task.action}`,
    targetType: 'server',
    targetId: server.id,
    metadata: {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      taskId: task.id,
      taskAction: task.action,
      taskPayload: task.payload,
    },
  });
}
