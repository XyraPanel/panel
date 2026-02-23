import type { NetworkData, ServerAllocation } from '#shared/types/server';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerAllocations } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

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
    requiredPermissions: ['allocation.read'],
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
    createdAt:
      allocation.createdAt instanceof Date
        ? allocation.createdAt
        : new Date(allocation.createdAt).toISOString(),
    updatedAt:
      allocation.updatedAt instanceof Date
        ? allocation.updatedAt
        : new Date(allocation.updatedAt).toISOString(),
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
