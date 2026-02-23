import { desc, sql } from 'drizzle-orm';
import type {
  AdminWingsNodeDetail,
  AdminWingsNodeAllocationSummary,
  AdminWingsNodeServerSummary,
} from '#shared/types/admin';
import { requireAdmin } from '#server/utils/security';
import { getWingsNode } from '#server/utils/wings/nodesStore';
import { remoteGetSystemInformation } from '#server/utils/wings/registry';
import { isH3Error } from '#server/utils/wings/http';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  if (typeof value === 'bigint') {
    return new Date(Number(value)).toISOString();
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return new Date(numeric).toISOString();
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

export default defineEventHandler(async (event) => {
  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  await requireAdmin(event);

  const db = useDrizzle();
  const node = await getWingsNode(id);

  const [serversTotalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tables.servers)
    .where(eq(tables.servers.nodeId, id));

  const [allocationsTotalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tables.serverAllocations)
    .innerJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id));

  const [resourceTotals] = await db
    .select({
      memory: sql<number>`COALESCE(SUM(${tables.serverLimits.memory}), 0)`,
      disk: sql<number>`COALESCE(SUM(${tables.serverLimits.disk}), 0)`,
    })
    .from(tables.serverLimits)
    .innerJoin(tables.servers, eq(tables.serverLimits.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id));

  const recentServersRows = await db
    .select({
      id: tables.servers.id,
      uuid: tables.servers.uuid,
      identifier: tables.servers.identifier,
      name: tables.servers.name,
      createdAt: tables.servers.createdAt,
      updatedAt: tables.servers.updatedAt,
      primaryIp: tables.serverAllocations.ip,
      primaryPort: tables.serverAllocations.port,
    })
    .from(tables.servers)
    .leftJoin(
      tables.serverAllocations,
      sql`${tables.serverAllocations.serverId} = ${tables.servers.id} AND ${tables.serverAllocations.isPrimary} = true`,
    )
    .where(eq(tables.servers.nodeId, id))
    .orderBy(desc(tables.servers.updatedAt))
    .limit(5);

  const allocationRows = await db
    .select({
      id: tables.serverAllocations.id,
      ip: tables.serverAllocations.ip,
      ipAlias: tables.serverAllocations.ipAlias,
      port: tables.serverAllocations.port,
      isPrimary: tables.serverAllocations.isPrimary,
      serverId: tables.serverAllocations.serverId,
      serverName: tables.servers.name,
      serverIdentifier: tables.servers.identifier,
    })
    .from(tables.serverAllocations)
    .innerJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id))
    .orderBy(desc(tables.serverAllocations.isPrimary), desc(tables.serverAllocations.createdAt))
    .limit(25);

  const recentServers: AdminWingsNodeServerSummary[] = recentServersRows.map((row) => ({
    id: row.id,
    uuid: row.uuid,
    identifier: row.identifier,
    name: row.name,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
    primaryAllocation:
      row.primaryIp && row.primaryPort ? { ip: row.primaryIp, port: row.primaryPort } : null,
  }));

  const allocations: AdminWingsNodeAllocationSummary[] = allocationRows.map((row) => ({
    id: row.id,
    ip: row.ip,
    ipAlias: row.ipAlias ?? null,
    port: row.port,
    isPrimary: Boolean(row.isPrimary),
    serverId: row.serverId,
    serverName: row.serverName,
    serverIdentifier: row.serverIdentifier,
  }));

  let system: AdminWingsNodeDetail['system'] = null;
  let systemError: string | null = null;
  try {
    system = await remoteGetSystemInformation(id, 2);
  } catch (error) {
    if (isH3Error(error)) {
      systemError = error.message || error.statusMessage || 'Failed to reach Wings node';
    } else if (error instanceof Error) {
      systemError = error.message;
    } else {
      systemError = 'Failed to reach Wings node';
    }
  }

  const payload: AdminWingsNodeDetail = {
    node,
    stats: {
      serversTotal: toNumber(serversTotalRow?.count, 0),
      allocationsTotal: toNumber(allocationsTotalRow?.count, 0),
      maintenanceMode: node.maintenanceMode,
      memoryProvisioned: toNumber(resourceTotals?.memory, 0),
      diskProvisioned: toNumber(resourceTotals?.disk, 0),
      lastSeenAt: node.lastSeenAt,
    },
    recentServers,
    allocations,
    system,
    systemError,
  };

  return {
    data: payload,
  };
});
