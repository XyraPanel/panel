import { type H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { deleteWingsNode } from '#server/utils/wings/nodesStore';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  try {
    deleteWingsNode(id);
    await recordAuditEventFromRequest(event, {
      actor: session?.user?.id ?? 'admin',
      actorType: 'user',
      action: 'admin:wings.node.deleted',
      targetType: 'node',
      targetId: id,
    });

    return { data: { id } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete node';
    const status = message.includes('not found') ? 404 : 500;
    throw createError({ status, statusText: message });
  }
});
