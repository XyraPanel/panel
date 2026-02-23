import { requireAdmin } from '#server/utils/security';
import { getWingsNodeConfigurationById } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { useRuntimeConfig, getRequestURL } from '#imports';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
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
    const message = error instanceof Error ? error.message : 'Failed to build node configuration';
    throw createError({ status: 404, statusText: message });
  }
});
