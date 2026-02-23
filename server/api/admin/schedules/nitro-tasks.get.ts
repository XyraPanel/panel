import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { NitroTasksResponse } from '#shared/types/admin';

export default defineEventHandler(async (event): Promise<{ data: NitroTasksResponse }> => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SCHEDULES,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  try {
    const url = new URL('/_nitro/tasks', `http://${event.node.req.headers.host}`);
    const response = await fetch(url.toString());
    const data = (await response.json()) as NitroTasksResponse;

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.schedules.nitro_tasks.viewed',
      targetType: 'settings',
      metadata: {
        taskCount: Object.keys(data.tasks ?? {}).length,
        scheduleCount: data.scheduledTasks?.length ?? 0,
      },
    });

    return { data };
  } catch (error) {
    console.error('Failed to fetch Nitro tasks:', error);
    const fallback: NitroTasksResponse = {
      tasks: {},
      scheduledTasks: [],
    };

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.schedules.nitro_tasks.failed',
      targetType: 'settings',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return { data: fallback };
  }
});
