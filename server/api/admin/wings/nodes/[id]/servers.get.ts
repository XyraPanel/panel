import { and, desc, like, or, sql } from 'drizzle-orm';
import type {
  AdminPaginatedMeta,
  AdminWingsNodeServerSummary,
  AdminWingsNodeServersPayload,
} from '#shared/types/admin';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

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

export default defineEventHandler(async (event): Promise<AdminWingsNodeServersPayload> => {
  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  const session = await requireAdmin(event);

  const query = getQuery(event);
  const pageParam = typeof query.page === 'string' ? Number.parseInt(query.page, 10) : 1;
  const perPageParam = typeof query.perPage === 'string' ? Number.parseInt(query.perPage, 10) : 25;
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const perPage = Number.isNaN(perPageParam) ? 25 : Math.min(Math.max(perPageParam, 1), 100);
  const offset = (page - 1) * perPage;

  const db = useDrizzle();

  const nodeFilter = eq(tables.servers.nodeId, id);
  const whereClause =
    search.length > 0
      ? and(
          nodeFilter,
          or(
            like(tables.servers.name, `%${search}%`),
            like(tables.servers.identifier, `%${search}%`),
          ),
        )
      : nodeFilter;

  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tables.servers)
    .where(whereClause);

  const rows = await db
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
    .where(whereClause)
    .orderBy(desc(tables.servers.updatedAt))
    .limit(perPage)
    .offset(offset);

  const data: AdminWingsNodeServerSummary[] = rows.map((row) => ({
    id: row.id,
    uuid: row.uuid,
    identifier: row.identifier,
    name: row.name,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
    primaryAllocation:
      row.primaryIp && row.primaryPort ? { ip: row.primaryIp, port: row.primaryPort } : null,
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
    action: 'admin.wings.node.servers.listed',
    targetType: 'node',
    targetId: id,
    metadata: {
      page,
      perPage,
      total,
      returned: data.length,
      search: search || undefined,
    },
  });

  return {
    data,
    pagination,
  };
});
