import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAdmin } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { initiateServerTransfer } from '#server/utils/transfers/initiate';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { serverTransferSchema } from '~~/shared/schema/admin/server';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'Initiate a server transfer to another node',
    description:
      'Starts an asynchronous transfer of the server to a different node, optionally with a specific target allocation and additional allocations. Requires an admin session with the servers:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['nodeId'],
            properties: {
              nodeId: { type: 'string' },
              allocationId: { type: 'string' },
              additionalAllocationIds: { type: 'array', items: { type: 'string' } },
              startOnCompletion: { type: 'boolean' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Transfer initiated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    transferId: { type: 'string' },
                    server: { type: 'object' },
                    sourceNodeId: { type: 'string' },
                    targetNodeId: { type: 'string' },
                    newAllocationId: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is required, or invalid transfer parameters' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing servers:write ACL permission' },
      '404': { description: 'Server, source node, or target node not found' },
      '500': { description: 'Failed to initiate server transfer' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'id');
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
