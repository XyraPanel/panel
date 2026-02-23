import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.ALLOCATIONS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const nodeId = getRouterParam(event, 'id');
  if (!nodeId) {
    throw createError({
      status: 400,
      message: 'Node ID is required',
    });
  }

  const db = useDrizzle();
  const allocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.nodeId, nodeId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.allocations.listed',
    targetType: 'node',
    targetId: nodeId,
    metadata: {
      count: allocations.length,
    },
  });

  return {
    data: allocations,
  };
});
