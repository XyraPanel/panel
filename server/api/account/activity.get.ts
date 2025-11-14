import { createError, defineEventHandler, getQuery } from 'h3'
import { desc, eq } from 'drizzle-orm'

import { useDrizzle, tables } from '~~/server/utils/drizzle'
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
  const limitParam = Number.parseInt(typeof query.limit === 'string' ? query.limit : '20', 10)
  const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100)

  const db = useDrizzle()

  const rows = db.select({
    id: tables.auditEvents.id,
    occurredAt: tables.auditEvents.occurredAt,
    action: tables.auditEvents.action,
    targetType: tables.auditEvents.targetType,
    targetId: tables.auditEvents.targetId,
    metadata: tables.auditEvents.metadata,
  })
    .from(tables.auditEvents)
    .where(eq(tables.auditEvents.actor, user.username))
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .all()

  const data: AccountActivityItem[] = rows.map((row) => ({
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
