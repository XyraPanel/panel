import { asc, desc, sql, or, like } from 'drizzle-orm';
import { z } from 'zod';

import type {
  AdminPaginatedMeta,
  AdminWingsNodeAllocationSummary,
  AdminWingsNodeAllocationsPayload,
} from '#shared/types/admin';

import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

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

export default defineEventHandler(async (event): Promise<AdminWingsNodeAllocationsPayload> => {
  const { id } = getRouterParams(event);
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  const session = await requireAdmin(event);

  const { page, perPage, search } = await getValidatedQuery(event, z.object({
    page: z.coerce.number().min(1).default(1),
    perPage: z.coerce.number().min(1).max(1000).default(25),
    search: z.string().trim().default('').transform((value) => value || null),
  }));
  
  const offset = (page - 1) * perPage;

  const db = useDrizzle();

  const baseWhere = search
    ? and(
        eq(tables.serverAllocations.nodeId, id),
        or(
          like(tables.serverAllocations.ip, `%${search}%`),
          like(sql`CAST(${tables.serverAllocations.port} AS TEXT)`, `%${search}%`),
          like(tables.serverAllocations.ipAlias, `%${search}%`),
        ),
      )
    : eq(tables.serverAllocations.nodeId, id);

  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tables.serverAllocations)
    .where(baseWhere);

  const rows = await db
    .select({
      id: tables.serverAllocations.id,
      ip: tables.serverAllocations.ip,
      ipAlias: tables.serverAllocations.ipAlias,
      port: tables.serverAllocations.port,
      isPrimary: tables.serverAllocations.isPrimary,
      createdAt: tables.serverAllocations.createdAt,
      serverId: tables.serverAllocations.serverId,
      serverName: tables.servers.name,
      serverIdentifier: tables.servers.identifier,
    })
    .from(tables.serverAllocations)
    .leftJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(baseWhere)
    .orderBy(
      desc(tables.serverAllocations.isPrimary),
      asc(tables.serverAllocations.ip),
      asc(tables.serverAllocations.port),
    )
    .limit(perPage)
    .offset(offset);

  const data: AdminWingsNodeAllocationSummary[] = rows.map((row) => ({
    id: row.id,
    ip: row.ip,
    ipAlias: row.ipAlias ?? null,
    port: row.port,
    isPrimary: Boolean(row.isPrimary),
    serverId: row.serverId ?? null,
    serverName: row.serverName ?? '',
    serverIdentifier: row.serverIdentifier ?? '',
  }));

  const total = toNumber(totalRow?.count, 0);
  const pagination: AdminPaginatedMeta = {
    page,
    perPage,
    total,
    hasMore: offset + data.length < total,
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.wings.node.allocations.listed',
    targetType: 'node',
    targetId: id,
    metadata: {
      page,
      perPage,
      total,
      returned: data.length,
    },
  });

  return {
    data,
    pagination,
  };
});
