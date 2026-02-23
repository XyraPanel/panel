import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import type { AdminScheduleResponse, NitroTasksResponse } from '#shared/types/admin';
import { recordAuditEventFromRequest } from '#server/utils/audit';

function parseCronField(field: string): number | null {
  if (!field || field === '*' || field.startsWith('*/')) return null;
  const val = parseInt(field, 10);
  return isNaN(val) ? null : val;
}

function computeNextRun(cronExpression: string): string {
  const now = new Date();
  const parts = cronExpression.trim().split(/\s+/);
  const [mf = '*', hf = '*', df = '*', monf = '*', wdf = '*'] = parts;

  const targetMinute = parseCronField(mf);
  const targetHour = parseCronField(hf);
  const targetDay = parseCronField(df);
  const targetMonth = parseCronField(monf);
  const targetWeekday = parseCronField(wdf);

  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 366; i++) {
    const ok =
      (targetMinute === null || next.getMinutes() === targetMinute) &&
      (targetHour === null || next.getHours() === targetHour) &&
      (targetDay === null || next.getDate() === targetDay) &&
      (targetMonth === null || next.getMonth() === targetMonth - 1) &&
      (targetWeekday === null || next.getDay() === targetWeekday);
    if (ok) return next.toISOString();
    next.setMinutes(next.getMinutes() + 1);
  }

  const fallback = new Date(now);
  fallback.setMinutes(fallback.getMinutes() + 1);
  fallback.setSeconds(0);
  fallback.setMilliseconds(0);
  return fallback.toISOString();
}

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SCHEDULES,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const wingsSchedules: AdminScheduleResponse[] = [];

  let nitroTasksResponse: NitroTasksResponse = { tasks: {}, scheduledTasks: [] };

  try {
    const host = event.node.req.headers.host || 'localhost';
    const protocol = event.node.req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${host}/api/admin/schedules/nitro-tasks`;

    const response = await fetch(url, {
      headers: {
        cookie: event.node.req.headers.cookie || '',
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as { data?: NitroTasksResponse } | NitroTasksResponse;
      nitroTasksResponse =
        'data' in payload && payload.data ? payload.data : (payload as NitroTasksResponse);
    }
  } catch (error) {
    console.error('Failed to fetch Nitro tasks:', error);
  }

  const allSchedules: AdminScheduleResponse[] = [...wingsSchedules];

  for (const scheduledTask of nitroTasksResponse.scheduledTasks ?? []) {
    for (const taskName of scheduledTask.tasks) {
      const taskInfo = nitroTasksResponse.tasks[taskName];

      const displayName = taskInfo?.description
        ? taskInfo.description.charAt(0).toUpperCase() + taskInfo.description.slice(1)
        : taskName
            .split(':')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '))
            .join(' ');

      allSchedules.push({
        id: `nitro:${taskName}:${scheduledTask.cron}`,
        name: displayName,
        description: taskName,
        serverName: 'Panel (Nitro)',
        cron: scheduledTask.cron,
        nextRun: computeNextRun(scheduledTask.cron),
        enabled: true,
        type: 'nitro',
      });
    }
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.schedules.viewed',
    targetType: 'settings',
    targetId: null,
    metadata: {
      scheduleCount: allSchedules.length,
      nitroTasks: nitroTasksResponse.scheduledTasks?.length ?? 0,
    },
  });

  return {
    data: allSchedules,
  };
});
