import { type H3Event } from 'h3';
import { createWingsNode, toWingsNodeSummary } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';

import { createWingsNodeSchema } from '#shared/schema/wings';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
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
      statusMessage: 'Unable to create node',
      message,
      data: {
        message,
      },
    });
  }
});
