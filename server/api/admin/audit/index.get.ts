import { getServerSession } from '#auth'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { count, desc, eq, like, or, and } from 'drizzle-orm'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 50
  const search = query.search as string | undefined
  const actor = query.actor as string | undefined
  const action = query.action as string | undefined
  const targetType = query.targetType as string | undefined
  const offset = (page - 1) * limit

  const db = useDrizzle()

  const conditions = []

  if (search) {
    conditions.push(
      or(
        like(tables.auditEvents.actor, `%${search}%`),
        like(tables.auditEvents.action, `%${search}%`),
        like(tables.auditEvents.targetId, `%${search}%`),
      ),
    )
  }

  if (actor) {
    conditions.push(eq(tables.auditEvents.actor, actor))
  }

  if (action) {
    conditions.push(eq(tables.auditEvents.action, action))
  }

  if (targetType) {
    conditions.push(eq(tables.auditEvents.targetType, targetType))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const countResult = db
    .select({ total: count() })
    .from(tables.auditEvents)
    .where(whereClause)
    .all()

  const total = countResult[0]?.total ?? 0

  const events = db
    .select({
      id: tables.auditEvents.id,
      occurredAt: tables.auditEvents.occurredAt,
      actor: tables.auditEvents.actor,
      actorType: tables.auditEvents.actorType,
      action: tables.auditEvents.action,
      targetType: tables.auditEvents.targetType,
      targetId: tables.auditEvents.targetId,
      metadata: tables.auditEvents.metadata,
    })
    .from(tables.auditEvents)
    .where(whereClause)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .offset(offset)
    .all()

  const parseMetadata = (value: string | null) => {
    if (!value) {
      return {}
    }

    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
      return { value: parsed }
    }
    catch {
      return { raw: value }
    }
  }

  const transformTimestamp = (raw: Date | number) => {
    const date = raw instanceof Date ? raw : new Date(raw)
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
  }

  return {
    data: events.map(event => ({
      id: event.id,
      occurredAt: transformTimestamp(event.occurredAt),
      actor: event.actor,
      action: event.action,
      target: event.targetId ? `${event.targetType}#${event.targetId}` : event.targetType,
      details: parseMetadata(event.metadata),
    })),
    pagination: {
      page,
      perPage: limit,
      total,
      hasMore: offset + events.length < total,
    },
  }
})
