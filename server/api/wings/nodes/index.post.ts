import { type H3Event } from 'h3';
import { createWingsNode, toWingsNodeSummary } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

import { createWingsNodeSchema } from '#shared/schema/wings';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);
  const body = await readValidatedBodyWithLimit(
    event,
    createWingsNodeSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const node = await createWingsNode(body);

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.id ?? 'admin',
      actorType: 'user',
      action: 'admin:wings.node.created',
      targetType: 'node',
      targetId: node.id,
      metadata: {
        name: node.name,
        fqdn: node.fqdn,
        baseUrl: node.baseURL,
      },
    });

    return { data: toWingsNodeSummary(node) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create node';
    throw createError({
      statusCode: 400,
      message,
      data: {
        message,
      },
    });
  }
});
