import { type H3Event } from 'h3';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { findWingsNode, updateWingsNode, toWingsNodeSummary } from '#server/utils/wings/nodesStore';

import { updateWingsNodeSchema } from '#shared/schema/wings';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);
  assertMethod(event, 'PATCH');

  const { id } = getRouterParams(event);
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  const existing = await findWingsNode(id);
  if (!existing) {
    throw createError({ status: 404, message: 'Node not found' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateWingsNodeSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const node = await updateWingsNode(id, body);

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.id ?? 'admin',
      actorType: 'user',
      action: 'admin:wings.node.updated',
      targetType: 'node',
      targetId: id,
      metadata: {
        name: node.name,
        fqdn: node.fqdn,
      },
    });

    return { data: toWingsNodeSummary(node) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update node';
    throw createError({ status: 400, message });
  }
});
