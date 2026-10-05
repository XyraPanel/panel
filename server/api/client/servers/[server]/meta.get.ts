import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Get minimal server metadata',
    description:
      'Returns a lightweight id/identifier/name payload for a server. Requires the server.view permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Server metadata',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    identifier: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.view permission on this server' },
      '404': { description: 'Server not found or not accessible' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
  });

  return {
    data: {
      id: server.id,
      identifier: server.identifier,
      name: server.name,
    },
  };
});
