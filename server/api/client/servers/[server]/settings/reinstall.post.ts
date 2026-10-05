import { requireAccountUser } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { recordServerActivity } from '#server/utils/server-activity';
import { getWingsClientForServer } from '#server/utils/wings-client';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Reinstall the server',
    description:
      'Marks the server as installing and triggers a reinstall on the Wings daemon, re-running the egg install script. Requires the server.settings.update permission. Fails if the server is suspended.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Reinstall triggered',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.settings.update permission, or server is suspended' },
      '404': { description: 'Server not found or not accessible' },
      '500': { description: 'Failed to trigger reinstall on Wings' },
    },
  },
});

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
    logger.error('Failed to trigger reinstall on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to trigger reinstall',
    });
  }
});
