import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const scheduleId = getRouterParam(event, 'schedule');

  if (!serverId || !scheduleId) {
    throw createError({
      status: 400,
      message: 'Server and schedule identifiers are required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.delete'],
  });

  const db = useDrizzle();
  const [schedule] = await db
    .select()
    .from(tables.serverSchedules)
    .where(
      and(
        eq(tables.serverSchedules.id, scheduleId),
        eq(tables.serverSchedules.serverId, server.id),
      ),
    )
    .limit(1);

  if (!schedule) {
    throw createError({
      status: 404,
      message: 'Schedule not found',
    });
  }

  await db.delete(tables.serverSchedules).where(eq(tables.serverSchedules.id, scheduleId));

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.email || accountContext.user.id,
    actorType: 'user',
    action: 'server.schedule.deleted',
    targetType: 'settings',
    targetId: scheduleId,
    metadata: {
      serverId: server.id,
      scheduleName: schedule?.name,
    },
  });

  await invalidateScheduleCaches({ serverId: server.id, scheduleId });

  return {
    success: true,
  };
});
