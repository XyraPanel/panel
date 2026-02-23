import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const db = useDrizzle();
  const nodes = await db
    .select({
      id: tables.wingsNodes.id,
      name: tables.wingsNodes.name,
    })
    .from(tables.wingsNodes)
    .orderBy(tables.wingsNodes.name);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.wings.nodes.listed',
    targetType: 'node',
    metadata: { count: nodes.length },
  });

  return { data: nodes };
});
