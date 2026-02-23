import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { getWingsClient, WingsConnectionError, WingsAuthError } from '#server/utils/wings-client';
import type { WingsNode } from '#shared/types/wings-client';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);

  const nodeId = getRouterParam(event, 'id');
  if (!nodeId) {
    throw createError({ status: 400, statusText: 'Node ID is required' });
  }

  const db = useDrizzle();

  const [node] = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, nodeId))
    .limit(1);

  if (!node) {
    throw createError({ status: 404, statusText: 'Node not found' });
  }

  const wingsNode: WingsNode = {
    id: node.id,
    fqdn: node.fqdn,
    scheme: node.scheme as 'http' | 'https',
    daemonListen: node.daemonListen,
    daemonSftp: node.daemonSftp,
    daemonBase: node.daemonBase,
    tokenId: node.tokenIdentifier,
    token: node.tokenSecret,
  };

  const client = getWingsClient(wingsNode);

  try {
    const isConnected = await client.testConnection();

    if (isConnected) {
      const systemInfo = await client.getSystemInfo();

      await db
        .update(tables.wingsNodes)
        .set({
          lastSeenAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.wingsNodes.id, nodeId));

      await recordAuditEventFromRequest(event, {
        actor: session.user.email || session.user.id,
        actorType: 'user',
        action: 'admin.node.connection_test.success',
        targetType: 'node',
        targetId: nodeId,
        metadata: {
          fqdn: node.fqdn,
        },
      });

      return {
        data: {
          success: true,
          connected: true,
          message: 'Successfully connected to Wings daemon',
          systemInfo,
        },
      };
    } else {
      await recordAuditEventFromRequest(event, {
        actor: session.user.email || session.user.id,
        actorType: 'user',
        action: 'admin.node.connection_test.failed',
        targetType: 'node',
        targetId: nodeId,
        metadata: {
          fqdn: node.fqdn,
          reason: 'connection_failed',
        },
      });

      return {
        data: {
          success: false,
          connected: false,
          message: 'Failed to connect to Wings daemon',
        },
      };
    }
  } catch (error) {
    console.error('Wings connection test failed:', error);

    let errorMessage = 'Unknown connection error';
    let errorType = 'unknown';

    if (error instanceof WingsAuthError) {
      errorMessage = 'Authentication failed - check node tokens';
      errorType = 'auth';
    } else if (error instanceof WingsConnectionError) {
      errorMessage = error.message;
      errorType = 'connection';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.node.connection_test.failed',
      targetType: 'node',
      targetId: nodeId,
      metadata: {
        fqdn: node.fqdn,
        errorType,
        errorMessage,
      },
    });

    return {
      data: {
        success: false,
        connected: false,
        message: errorMessage,
        errorType,
      },
    };
  }
});
