import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerSubusers } from '#server/utils/subusers';
import { requireAccountUser } from '#server/utils/security';
import { requireServerPermission } from '#server/utils/permission-middleware';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Subusers'],
    summary: 'List subusers',
    description:
      'Returns all subusers granted access to the server. Requires the server.users.read permission (owner/admin always allowed).',
    parameters: [{ name: 'server', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Subusers for the server',
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
                      permissions: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.users.read permission' },
      '404': { description: 'Server not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.users.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const subusers = await listServerSubusers(server.id);

  return {
    data: subusers,
  };
});
