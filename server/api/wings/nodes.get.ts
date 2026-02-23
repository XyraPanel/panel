import type { H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { listWingsNodeSummaries } from '#server/utils/wings/nodesStore';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const data = await listWingsNodeSummaries();

  await recordAuditEventFromRequest(event, {
    actor: session?.user?.id ?? 'admin',
    actorType: 'user',
    action: 'admin:wings.nodes.listed',
    targetType: 'node',
    targetId: null,
  });

  return { data };
});
