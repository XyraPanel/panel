import { createError, defineEventHandler, getQuery } from 'h3'
import { desc, eq } from 'drizzle-orm'

import { tables, useDrizzle } from '~~/server/utils/drizzle'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import type { AccountActivityItem, AccountActivityResponse } from '#shared/types/activity'
import type { ActivityMetadata } from '#shared/types/audit'

function parseMetadata(raw: string | null): ActivityMetadata | null {
  if (!raw) {
    return null
  }

  try {
    const value = JSON.parse(raw) as unknown
    if (value && typeof value === 'object') {
      return value as ActivityMetadata
    }
    return { value }
  }
  catch {
    return { raw }
  }
}

export default defineEventHandler(async (event): Promise<AccountActivityResponse> => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user?.username) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const limit = Math.min(Number.parseInt(query.limit as string ?? '20', 10), 100)

  const db = useDrizzle()

  const events = db.select({
    id: tables.auditEvents.id,
    occurredAt: tables.auditEvents.occurredAt,
    actor: tables.auditEvents.actor,
    action: tables.auditEvents.action,
    targetType: tables.auditEvents.targetType,
    targetId: tables.auditEvents.targetId,
    metadata: tables.auditEvents.metadata,
  })
    .from(tables.auditEvents)
    .where(eq(tables.auditEvents.actor, user.username))
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(Number.isNaN(limit) || limit <= 0 ? 20 : limit)
    .all()

  const data: AccountActivityItem[] = events.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    action: row.action,
    target: row.targetId ? `${row.targetType}#${row.targetId}` : row.targetType,
    metadata: parseMetadata(row.metadata),
  }))

  return {
    data,
    generatedAt: new Date().toISOString(),
  }
})
