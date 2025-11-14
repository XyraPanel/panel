import { getServerSession } from '#auth'
import { isAdmin, getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const user = getSessionUser(session)
  const db = useDrizzle()

  const keys = db
    .select({
      id: tables.apiKeys.id,
      identifier: tables.apiKeys.identifier,
      memo: tables.apiKeys.memo,
      lastUsedAt: tables.apiKeys.lastUsedAt,
      expiresAt: tables.apiKeys.expiresAt,
      createdAt: tables.apiKeys.createdAt,
    })
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user!.id))
    .orderBy(tables.apiKeys.createdAt)
    .all()

  return {
    data: keys.map(key => ({
      id: key.id,
      identifier: key.identifier,
      memo: key.memo,
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      expiresAt: key.expiresAt?.toISOString() || null,
      createdAt: key.createdAt.toISOString(),
    })),
  }
})
