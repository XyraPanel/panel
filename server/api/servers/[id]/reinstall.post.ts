import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({ status: 400, statusText: 'Server ID required' });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['settings.reinstall'],
  });

  const db = useDrizzle();

  if (server.suspended) {
    throw createError({
      status: 400,
      statusText: 'Cannot reinstall a suspended server',
    });
  }

  console.log('[Reinstall] Starting server reinstall:', {
    serverId: server.id,
    serverUuid: server.uuid,
    serverName: server.name,
    currentStatus: server.status,
    currentDockerImage: server.dockerImage || server.image,
    eggId: server.eggId,
    requestedBy: user.email,
    timestamp: new Date().toISOString(),
  });

  try {
    const { getWingsClientForServer } = await import('#server/utils/wings-client');
    const { client } = await getWingsClientForServer(server.uuid);

    console.log('[Reinstall] Calling Wings reinstall endpoint...');
    await client.reinstallServer(server.uuid);

    console.log('[Reinstall] Wings accepted reinstall request, updating status to installing');

    await db
      .update(tables.servers)
      .set({
        status: 'installing',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.servers.id, server.id));

    console.log('[Reinstall] Server status updated to installing');
  } catch (error) {
    console.error('[Reinstall] Wings reinstall failed:', {
      error: error instanceof Error ? error.message : String(error),
      serverId: server.id,
      serverUuid: server.uuid,
    });
    throw createError({
      status: 500,
      statusText: 'Failed to trigger reinstall on Wings',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.settings.reinstall_requested',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      serverName: server.name,
      requestedBy: user.email ?? user.username,
    },
  });

  return {
    data: {
      success: true,
      message: 'Server reinstallation has been queued',
    },
  };
});
