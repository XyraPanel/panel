import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerAllocations } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Network'],
    summary: 'List allocations (grouped by primary)',
    description:
      'Returns the server\'s network allocations split into a "primary" allocation and the remaining additional allocations. Requires the server.allocation.read permission (owner/admin always allowed).',
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
                  type: 'object',
                  properties: {
                    primary: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        ip: { type: 'string' },
                        port: { type: 'integer' },
                        ipAlias: { type: 'string', nullable: true },
                        isPrimary: { type: 'boolean' },
                        notes: { type: 'string', nullable: true },
                      },
                    },
                    allocations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          ip: { type: 'string' },
                          port: { type: 'integer' },
                          ipAlias: { type: 'string', nullable: true },
                          isPrimary: { type: 'boolean' },
                          notes: { type: 'string', nullable: true },
                        },
                      },
                    },
                    allocation_limit: { type: 'integer', nullable: true },
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
  const normalizeAllocation = (allocation: (typeof allocations)[number]) => ({
    id: allocation.id,
    ip: allocation.ip,
    port: allocation.port,
    ipAlias: allocation.ipAlias ?? null,
    isPrimary: Boolean(allocation.isPrimary),
    notes: allocation.notes ?? null,
  });

  const mappedAllocations = allocations.map(normalizeAllocation);
  const primaryAllocation = mappedAllocations.find((a) => a.isPrimary) ?? null;
  const additionalAllocations = mappedAllocations.filter((a) => !a.isPrimary);

  return {
    data: {
      primary: primaryAllocation,
      allocations: additionalAllocations,
      allocation_limit: server.allocationLimit ?? null,
    },
  };
});
