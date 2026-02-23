import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { provisionServerOnWings } from '#server/utils/server-provisioning';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { serverProvisionSchema } from '#shared/schema/admin/server';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const { serverId, startOnCompletion = true } = await readValidatedBodyWithLimit(
    event,
    serverProvisionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  const [server] = serverRows;

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  if (!server.nodeId || !server.eggId) {
    throw createError({
      status: 400,
      message: 'Server is missing required configuration (node or egg)',
    });
  }

  const allocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id));

  const primaryAllocation = allocations.find((a) => a.isPrimary);
  if (!primaryAllocation) {
    throw createError({
      status: 400,
      message: 'Server has no primary allocation assigned',
    });
  }

  try {
    await provisionServerOnWings({
      serverId: server.id,
      serverUuid: server.uuid,
      eggId: server.eggId,
      nodeId: server.nodeId,
      allocationId: primaryAllocation.id,
      environment: {},
      startOnCompletion,
    });

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.provisioned',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        serverUuid: server.uuid,
        startOnCompletion,
      },
    });

    return {
      data: {
        success: true,
        message: 'Server provisioned on Wings successfully',
      },
    };
  } catch (error) {
    console.error('Failed to provision server on Wings:', error);
    throw createError({
      status: 500,
      message: error instanceof Error ? error.message : 'Failed to provision server on Wings',
    });
  }
});
