import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerAllocations } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Network'],
    summary: 'List allocations (flat)',
    description:
      'Returns the server\'s network allocations as a flat list, each flagged with isPrimary. Requires the server.allocation.read permission (owner/admin always allowed). Note: this route shares the same path as GET /network/allocations (allocations.get.ts); only one handler will actually be registered by Nitro.',
    parameters: [{ name: 'server', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Allocations for the server',
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
                      ip: { type: 'string' },
                      port: { type: 'integer' },
                      ipAlias: { type: 'string', nullable: true },
                      notes: { type: 'string', nullable: true },
                      isPrimary: { type: 'boolean' },
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
      '403': { description: 'Missing server.allocation.read permission' },
      '404': { description: 'Server not found' },
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
    requiredPermissions: ['server.allocation.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const allocations = await listServerAllocations(server.id);

  return {
    data: allocations.map((alloc) => ({
      id: alloc.id,
      ip: alloc.ip,
      port: alloc.port,
      ipAlias: alloc.ipAlias ?? null,
      notes: alloc.notes ?? null,
      isPrimary: Boolean(alloc.id === server.allocationId),
    })),
  };
});
