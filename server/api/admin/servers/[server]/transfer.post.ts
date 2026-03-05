import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAdmin } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { initiateServerTransfer } from '#server/utils/transfers/initiate';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { serverTransferSchema } from '~~/shared/schema/admin/server';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');
  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    serverTransferSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );
  const { nodeId: targetNodeId, allocationId, additionalAllocationIds, startOnCompletion } = body;

  try {
    const result = await initiateServerTransfer(serverId, targetNodeId, {
      allocationId,
      additionalAllocationIds,
      startOnCompletion,
    });

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.transfer.initiated',
      targetType: 'server',
      targetId: serverId,
      metadata: {
        transferId: result.transferId,
        sourceNodeId: result.sourceNodeId,
        targetNodeId,
        newAllocationId: result.newAllocationId,
        additionalAllocationIds,
        startOnCompletion,
      },
    });

    return {
      data: {
        success: true,
        transferId: result.transferId,
        server: result.server,
        sourceNodeId: result.sourceNodeId,
        targetNodeId: result.targetNodeId,
        newAllocationId: result.newAllocationId,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    logger.error('Failed to initiate server transfer:', error);

    throw createError({
      status: 500,
      message: `Failed to initiate server transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});
