import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerBackups } from '#server/utils/backups';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Backups'],
    summary: 'List backups',
    description:
      'Returns all backups for the server. Requires the server.backup.read permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID or identifier' },
    ],
    responses: {
      '200': {
        description: 'List of backups',
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
                      uuid: { type: 'string' },
                      name: { type: 'string' },
                      isSuccessful: { type: 'boolean' },
                      isLocked: { type: 'boolean' },
                      bytes: { type: 'integer', nullable: true },
                      createdAt: { type: 'string' },
                      completedAt: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing server identifier' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.backup.read permission' },
      '404': { description: 'Server not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.read'],
  });

  const backups = await listServerBackups(server.id);

  return {
    data: backups,
  };
});
