import { eq, and } from 'drizzle-orm';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { invalidateScheduleCaches } from '#server/utils/serversStore';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  const scheduleId = getRouterParam(event, 'scheduleId');

  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  if (!scheduleId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing schedule identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.delete'],
    allowOwner: true,
    allowAdmin: true,
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
    throw createError({ status: 404, statusText: 'Schedule not found' });
  }

  try {
    await db.delete(tables.serverSchedules).where(eq(tables.serverSchedules.id, scheduleId));

    await invalidateScheduleCaches({ serverId: server.id, scheduleId });

    await Promise.all([
      recordServerActivity({
        event,
        actorId: user.id,
        action: 'server.schedule.deleted',
        server: { id: server.id, uuid: server.uuid },
        metadata: { scheduleId, name: schedule.name },
      }),
      recordAuditEventFromRequest(event, {
        actor: user.id,
        actorType: 'user',
        action: 'server.schedule.deleted',
        targetType: 'server',
        targetId: server.id,
        metadata: { scheduleId, name: schedule.name },
      }),
    ]);

    return {
      data: {
        success: true,
        message: 'Schedule deleted successfully',
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to delete schedule',
    });
  }
});
