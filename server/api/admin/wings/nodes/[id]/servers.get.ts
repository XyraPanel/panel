import { and, desc, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
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
  const { id } = getRouterParams(event);
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  const session = await requireAdmin(event);

  const { page, perPage, search } = await getValidatedQuery(event, (data) => {
    const result = z.object({
      page: z.coerce.number().min(1).default(1),
      perPage: z.coerce.number().min(1).max(100).default(25),
      search: z.string().trim().default('')
    }).parse(data);
    
    return {
      page: result.page,
      perPage: result.perPage,
      search: result.search
    };
  });

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
