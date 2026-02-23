import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const { id: nodeId, allocationId } = event.context.params ?? {};

  if (!nodeId || typeof nodeId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  if (!allocationId || typeof allocationId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing allocation id' });
  }

  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);

  const db = useDrizzle();

  const [allocation] = await db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.id, allocationId),
        eq(tables.serverAllocations.nodeId, nodeId),
      ),
    )
    .limit(1);

  if (!allocation) {
    throw createError({ status: 404, statusText: 'Allocation not found' });
  }

  if (allocation.serverId) {
    throw createError({
      status: 400,
      statusText: 'Cannot delete allocation assigned to a server',
    });
  }

  await db.delete(tables.serverAllocations).where(eq(tables.serverAllocations.id, allocationId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.allocation.deleted',
    targetType: 'node',
    targetId: nodeId,
    metadata: {
      allocationId,
      ip: allocation.ip,
      port: allocation.port,
    },
  });

  return {
    data: {
      success: true,
      message: 'Allocation deleted successfully',
    },
  };
});
