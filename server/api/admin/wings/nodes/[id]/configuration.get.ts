import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { getWingsNodeConfigurationById } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { useRuntimeConfig, getRequestURL } from '#imports';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);
  const { id } = getRouterParams(event);
  if (!id) {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  const runtimeConfig = useRuntimeConfig();
  const panelConfig = (runtimeConfig.public?.panel ?? {}) as { baseUrl?: string };
  const requestUrl = getRequestURL(event);
  const panelUrl = panelConfig.baseUrl || `${requestUrl.protocol}//${requestUrl.host}`;

  try {
    const configuration = await getWingsNodeConfigurationById(id, panelUrl);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.node.configuration.viewed',
      targetType: 'node',
      targetId: id,
    });

    return { data: configuration };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Failed to build node configuration';
    throw createError({ status: 404, message });
  }
});
