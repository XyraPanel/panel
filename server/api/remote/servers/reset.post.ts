import type { H3Event } from 'h3';
import { useDrizzle, tables, eq, and, inArray } from '#server/utils/drizzle';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event: H3Event) => {
  assertMethod(event, 'POST');
  const db = useDrizzle();

  const nodeId = await getNodeIdFromAuth(event);

  const stuckServers = await db
    .select()
    .from(tables.servers)
    .where(
      and(
        eq(tables.servers.nodeId, nodeId),
        inArray(tables.servers.status, ['installing', 'restoring_backup']),
      ),
    );

  if (stuckServers.length > 0) {
    const serverIds = stuckServers.map((s) => s.id);

    await db
      .update(tables.servers)
      .set({ status: null })
      .where(and(eq(tables.servers.nodeId, nodeId), inArray(tables.servers.id, serverIds)));

    for (const server of stuckServers) {
      await recordAuditEventFromRequest(event, {
        actor: 'wings',
        actorType: 'system',
        action: 'server.state_reset',
        targetType: 'server',
        targetId: server.uuid,
        metadata: {
          previous_status: server.status,
          node_id: nodeId,
          reason: 'Wings daemon restart',
        },
      });
    }
  }

  return {
    data: {
      success: true,
      reset_count: stuckServers.length,
      servers: stuckServers.map((s) => s.uuid),
    },
  };
});
