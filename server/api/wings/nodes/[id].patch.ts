import { type H3Event } from 'h3';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { findWingsNode, updateWingsNode, toWingsNodeSummary } from '#server/utils/wings/nodesStore';

import { updateWingsNodeSchema } from '#shared/schema/wings';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  assertMethod(event, 'PATCH');

  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  const existing = findWingsNode(id);
  if (!existing) {
    throw createError({ status: 404, statusText: 'Node not found' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateWingsNodeSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const node = updateWingsNode(id, body);

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
    throw createError({ status: 400, statusText: message });
  }
});
