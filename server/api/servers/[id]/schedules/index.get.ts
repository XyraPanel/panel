import { listServerSchedules } from '#server/utils/schedules';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const schedules = await listServerSchedules(server.id);

  await Promise.all([
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.schedule.listed',
      server: { id: server.id, uuid: server.uuid },
      metadata: { count: schedules.length },
    }),
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.schedule.listed',
      targetType: 'server',
      targetId: server.id,
      metadata: { count: schedules.length },
    }),
  ]);

  return {
    data: schedules,
  };
});
