import { listServerDatabases } from '#server/utils/databases';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

defineRouteMeta({
  openAPI: {
    tags: ['Server Operations'],
    summary: 'List server databases',
    description:
      'Retrieves all databases associated with a specific server instance, including connection details and host information.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Server internal ID, UUID, or identifier',
      },
    ],
    responses: {
      200: {
        description: 'Successfully retrieved list of databases',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      hostId: { type: 'string' },
                      name: { type: 'string' },
                      username: { type: 'string' },
                      remote: { type: 'string' },
                      maxConnections: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing server identifier' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.database.read permission' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      message: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const databases = await listServerDatabases(server.id);

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.database.listed',
    server: { id: server.id, uuid: server.uuid },
    metadata: { count: databases.length },
  });

  return {
    data: databases,
  };
});
