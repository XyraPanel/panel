import { desc, eq, or, sql } from 'drizzle-orm';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);

  const query = getQuery(event);

  const page = Math.max(Number(query.page) || 1, 1);
  const limitParam = Number.parseInt(typeof query.limit === 'string' ? query.limit : '10', 10);
  const limit = Number.isNaN(limitParam) ? 10 : Math.min(Math.max(limitParam, 1), 100);
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

  const conditions = Array.from(actorIdentifiers).map((identifier) =>
    eq(tables.auditEvents.actor, identifier),
  );

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.auditEvents)
    .where(or(...conditions));

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
    .where(or(...conditions))
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
    metadata: { page, limit, total },
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
