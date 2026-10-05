import { z } from 'zod';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'List account activity',
    description:
      'Returns a paginated, filterable list of audit events for the authenticated account. Requires an authenticated account session.',
    parameters: [
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
      { name: 'search', in: 'query', schema: { type: 'string' } },
      { name: 'action', in: 'query', schema: { type: 'string' } },
      { name: 'targetType', in: 'query', schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Paginated audit event list',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      occurredAt: { type: 'string' },
                      action: { type: 'string' },
                      target: { type: 'string', nullable: true },
                      actor: { type: 'string' },
                      metadata: { type: 'object', nullable: true },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    perPage: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' },
                  },
                },
                generatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);

  const { page, limit, search, action, targetType } = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().min(1).catch(1).default(1),
      limit: z.coerce.number().min(1).max(100).catch(10).default(10),
      search: z.string().optional(),
      action: z.string().optional(),
      targetType: z.string().optional(),
    }),
  );
  const offset = (page - 1) * limit;

  const db = useDrizzle();

  const userId = user.id;
  const userEmail = user.email;

  const actorIdentifiers = new Set<string>();
  actorIdentifiers.add(String(userId));
  if (typeof userEmail === 'string' && userEmail.trim().length > 0) {
    actorIdentifiers.add(userEmail.trim());
    actorIdentifiers.add(userEmail.trim().toLowerCase());
  }

  const actorConditions = Array.from(actorIdentifiers).map((identifier) =>
    eq(tables.auditEvents.actor, identifier),
  );
 
  const initialFilter = or(...actorConditions);
  const filters: SQL[] = initialFilter ? [initialFilter] : [];

  if (search && search.trim()) {
    const searchFilter = or(
      like(tables.auditEvents.action, `%${search}%`),
      like(tables.auditEvents.targetId, `%${search}%`),
      like(tables.auditEvents.targetType, `%${search}%`),
    );
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  if (action) {
    filters.push(eq(tables.auditEvents.action, action));
  }

  if (targetType) {
    filters.push(eq(tables.auditEvents.targetType, targetType));
  }

  const whereClause = filters.length > 1 ? and(...filters) : filters[0];

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.auditEvents)
    .where(whereClause);

  const total = Number(totalResult[0]?.count ?? 0);

  const rows = await db
    .select({
      id: tables.auditEvents.id,
      occurredAt: tables.auditEvents.occurredAt,
      action: tables.auditEvents.action,
      actor: tables.auditEvents.actor,
      targetType: tables.auditEvents.targetType,
      targetId: tables.auditEvents.targetId,
      metadata: tables.auditEvents.metadata,
    })
    .from(tables.auditEvents)
    .where(whereClause)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  const data = rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    action: row.action,
    target: row.targetId ? `${row.targetType}#${row.targetId}` : row.targetType,
    actor: row.actor,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.activity.viewed',
    targetType: 'user',
    targetId: user.id,
    metadata: { page, limit, total, search: search ?? null, action: action ?? null, targetType: targetType ?? null },
  });

  return {
    data,
    pagination: {
      page,
      perPage: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    generatedAt: new Date().toISOString(),
  };
});
