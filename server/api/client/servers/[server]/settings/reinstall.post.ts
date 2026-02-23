import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { recordServerActivity } from '#server/utils/server-activity';
import { getWingsClientForServer } from '#server/utils/wings-client';

export default defineEventHandler(async (event) => {
  const { user, session } = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.update'],
  });

  if (server.suspended) {
    throw createError({
      status: 403,
      message: 'Server is suspended',
    });
  }

  const db = useDrizzle();
  await db
    .update(tables.servers)
    .set({
      status: 'installing',
      installedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.servers.id, server.id));

  await Promise.all([
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.reinstalled',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        serverId: server.id,
        serverUuid: server.uuid,
      },
    }),
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.reinstall.requested',
      server: { id: server.id, uuid: server.uuid },
    }),
  ]);

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.reinstallServer(server.uuid);

    return {
      data: {
        success: true,
        message: 'Server reinstall initiated',
      },
    };
  } catch (error) {
    console.error('Failed to trigger reinstall on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to trigger reinstall',
    });
  }
});
