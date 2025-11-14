import { createError, getQuery } from 'h3'
import { desc, eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

interface ServerActivityEvent {
  id: string
  occurredAt: string
  actor: string
  actorType: string
  action: string
  targetType: string
  targetId: string | null
  metadata: Record<string, unknown> | null
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null
  }

  try {
    const value = JSON.parse(raw) as unknown
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>
    }
    return { value }
  }
  catch {
    return { raw }
  }
}

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(identifier)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  if (user.role !== 'admin' && server.ownerId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const query = getQuery(event)
  const limit = Math.min(Number.parseInt(query.limit as string ?? '50', 10), 100)

  const db = useDrizzle()

  const events = await db
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
    .where(eq(tables.auditEvents.targetId, server.id))
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(Number.isNaN(limit) || limit <= 0 ? 50 : limit)
    .all()

  const data: ServerActivityEvent[] = events.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actor: row.actor,
    actorType: row.actorType,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: parseMetadata(row.metadata),
  }))

  return {
    data,
    generatedAt: new Date().toISOString(),
  }
})
