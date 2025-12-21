import { desc, eq } from 'drizzle-orm'
import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

import type { ServerActivityEvent } from '#shared/types/server'

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
  const serverIdentifier = getRouterParam(event, 'server')
  if (!serverIdentifier) {
    throw createError({ statusCode: 400, statusMessage: 'Server identifier is required' })
  }

  const session = await getServerSession(event)
  const { server } = await getServerWithAccess(serverIdentifier, session)

  const query = getQuery(event)
  const limit = Math.min(Number.parseInt((query.limit as string) ?? '50', 10), 100)

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
