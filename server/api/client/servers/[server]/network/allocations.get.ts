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
