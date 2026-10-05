import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getWingsClientForServer } from '#server/utils/wings-client';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'Reinstall a server',
    description:
      'Triggers a reinstall on the server\'s Wings node and sets its status to "installing". Requires an admin session with the servers:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
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
                  properties: { success: { type: 'boolean' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server ID is required, or server has no node assigned' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing servers:write ACL permission' },
      '404': { description: 'Server not found' },
      '500': { description: 'Failed to trigger server reinstall' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const serverId = getRouterParam(event, 'id');
  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server ID is required',
    });
  }

  const db = useDrizzle();
  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  if (!server.nodeId) {
    throw createError({
      status: 400,
      message: 'Server has no node assigned',
    });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.reinstallServer(server.uuid);

    await db
      .update(tables.servers)
      .set({ status: 'installing' })
      .where(eq(tables.servers.id, serverId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.reinstalled',
      targetType: 'server',
      targetId: serverId,
      metadata: {
        serverName: server.name,
        serverUuid: server.uuid,
      },
    });

    return {
      data: {
        success: true,
        message: 'Server reinstall initiated',
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw createError({
      status: 500,
      message: `Failed to trigger server reinstall: ${err.message}`,
    });
  }
});
