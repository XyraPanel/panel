import type { NetworkData, ServerAllocation } from '#shared/types/server';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerAllocations } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Get server network allocations',
    description:
      'Returns the primary allocation, additional allocations, and allocation limit for a server. Requires the server.allocation.read permission (or server owner/admin).',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Network allocation summary',
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
                        id: { type: 'integer' },
                        serverId: { type: 'integer' },
                        ip: { type: 'string' },
                        ipAlias: { type: 'string', nullable: true },
                        port: { type: 'integer' },
                        notes: { type: 'string', nullable: true },
                        isPrimary: { type: 'boolean' },
                        createdAt: { type: 'string' },
                        updatedAt: { type: 'string' },
                      },
                    },
                    allocations: { type: 'array', items: { type: 'object' } },
                    allocation_limit: { type: 'integer', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.allocation.read permission' },
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
    requiredPermissions: ['server.allocation.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const allocations = await listServerAllocations(server.id);

  const normalizeAllocation = (allocation: (typeof allocations)[number]): ServerAllocation => ({
    id: allocation.id,
    serverId: allocation.serverId ?? server.id,
    ip: allocation.ip,
    ipAlias: allocation.ipAlias ?? null,
    port: allocation.port,
    notes: allocation.notes ?? null,
    isPrimary: Boolean(allocation.isPrimary),
    createdAt: allocation.createdAt,
    updatedAt: allocation.updatedAt,
  });

  const mappedAllocations = allocations.map(normalizeAllocation);
  const primary = mappedAllocations.find((allocation) => allocation.isPrimary) ?? null;
  const additional = mappedAllocations.filter((allocation) => !allocation.isPrimary);

  return {
    data: <NetworkData>{
      primary,
      allocations: additional,
      allocation_limit: server.allocationLimit ?? null,
    },
  };
});
