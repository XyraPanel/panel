import { requireAccountUser } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { useDrizzle, tables, eq, isNotNull, and, desc } from '#server/utils/drizzle';
import { getMultipleServerStatuses } from '#server/utils/server-status';

import type { ServerListEntry, ServersResponse } from '#shared/types/server';

export default defineEventHandler(async (event): Promise<ServersResponse> => {
  try {
    const { user } = await requireAccountUser(event);

    const query = getQuery(event);
    const scopeParam = typeof query.scope === 'string' ? query.scope : 'own';
    const scope = scopeParam === 'all' ? 'all' : 'own';
    const includeAll = scope === 'all';

    if (includeAll) {
      const userRole = (user as { role?: string }).role;
      if (userRole !== 'admin') {
        throw createError({
          status: 403,
          statusText: 'Forbidden',
          message: 'Admin access required to view all servers',
        });
      }
    }

    const db = useDrizzle();

    const whereConditions = [isNotNull(tables.servers.nodeId)];
    if (!includeAll) {
      whereConditions.push(eq(tables.servers.ownerId, user.id));
    }

    const servers = await db
      .select({
        server: tables.servers,
        node: tables.wingsNodes,
        limits: tables.serverLimits,
        primaryAllocation: tables.serverAllocations,
      })
      .from(tables.servers)
      .leftJoin(tables.wingsNodes, eq(tables.servers.nodeId, tables.wingsNodes.id))
      .leftJoin(tables.serverLimits, eq(tables.serverLimits.serverId, tables.servers.id))
      .leftJoin(
        tables.serverAllocations,
        and(
          eq(tables.serverAllocations.serverId, tables.servers.id),
          eq(tables.serverAllocations.isPrimary, true),
        ),
      )
      .where(and(...whereConditions))
      .orderBy(desc(tables.servers.updatedAt));

    const serverUuids = servers.map(({ server }) => server.uuid);
    const liveStatuses = await getMultipleServerStatuses(serverUuids);
    const statusMap = new Map(liveStatuses.map((status) => [status.serverUuid, status.state]));

    const records: ServerListEntry[] = servers.map(
      ({ server, node, limits, primaryAllocation }) => ({
        uuid: server.uuid,
        identifier: server.identifier,
        name: server.name,
        nodeId: server.nodeId!,
        nodeName: node?.name || 'Unknown Node',
        description: server.description || null,
        limits: limits
          ? {
              cpu: limits.cpu ?? null,
              memory: limits.memory ?? null,
              disk: limits.disk ?? null,
            }
          : null,
        featureLimits: null,
        status: statusMap.get(server.uuid) || server.status || 'unknown',
        ownership: includeAll ? 'shared' : 'mine',
        suspended: server.suspended || false,
        isTransferring: false,
        primaryAllocation: primaryAllocation
          ? `${primaryAllocation.ip}:${primaryAllocation.port}`
          : null,
      }),
    );

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: includeAll ? 'servers.list.all' : 'servers.list.mine',
      targetType: 'user',
      targetId: user.id,
      metadata: { count: records.length, scope },
    });

    return {
      data: records,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[GET] /api/servers: Error fetching servers:', error);
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    throw createError({
      status: 500,
      statusText: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch servers',
    });
  }
});
