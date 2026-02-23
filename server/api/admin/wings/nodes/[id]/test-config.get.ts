import { requireAdmin } from '#server/utils/security';
import { getWingsNodeConfigurationById, findWingsNode } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { useRuntimeConfig, getRequestURL } from '#imports';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);

  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  const node = await findWingsNode(id);
  if (!node) {
    throw createError({ status: 404, statusText: 'Node not found' });
  }

  const runtimeConfig = useRuntimeConfig();
  const publicPanelConfig = (runtimeConfig.public?.panel ?? {}) as { baseUrl?: string };
  const requestUrl = getRequestURL(event);
  const panelUrl = publicPanelConfig.baseUrl || `${requestUrl.protocol}//${requestUrl.host}`;

  const encryptionKeyAvailable = !!(
    process.env.WINGS_ENCRYPTION_KEY ||
    process.env.NUXT_SESSION_PASSWORD ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET
  );

  try {
    const configuration = await getWingsNodeConfigurationById(id, panelUrl);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.node.configuration.tested',
      targetType: 'node',
      targetId: id,
      metadata: {
        nodeName: node.name,
      },
    });

    return {
      data: {
        success: true,
        encryptionKeyAvailable,
        nodeId: id,
        tokenLength: configuration.token?.length || 0,
        tokenId: configuration.token_id,
        uuid: configuration.uuid,
        tokenPreview: configuration.token
          ? `${configuration.token.substring(0, 20)}...`
          : '(empty)',
        fullConfig: configuration,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      data: {
        success: false,
        encryptionKeyAvailable,
        nodeId: id,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  }
});
