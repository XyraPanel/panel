import { createError, getQuery } from 'h3'
import { desc, eq, or, sql } from 'drizzle-orm'
import { getServerSession } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)

  const page = Math.max(Number(query.page) || 1, 1)
  const limitParam = Number.parseInt(
    typeof query.limit === 'string' ? query.limit : '10',
    10
  )
  const limit = Number.isNaN(limitParam) ? 10 : Math.min(Math.max(limitParam, 1), 100)
  const offset = (page - 1) * limit

  const db = useDrizzle()

  const userId = session.user.id
  const userEmail = session.user.email

  /** TODO: normalize actor column type */
  const actorId = String(userId)

  const conditions = [eq(tables.auditEvents.actor, actorId)]

  if (userEmail) {
    conditions.push(eq(tables.auditEvents.actor, userEmail))
  }

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(tables.auditEvents)
    .where(or(...conditions))
    .get()

  const total = Number(totalResult?.count ?? 0)

  const rows = db
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
    .offset(offset)
    .all()

  return {
    data: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      target: row.targetId ? `${row.targetType}#${row.targetId}` : row.targetType,
      actor: row.actor,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    })),
    pagination: {
      page,
      perPage: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    generatedAt: new Date().toISOString(),
  }
})
