import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const db = useDrizzle()
  const keys = db
    .select()
    .from(tables.apiKeys)
    .where(
      eq(tables.apiKeys.userId, user.id)
    )
    .all()

  return {
    data: keys.map(key => ({
      identifier: key.identifier,
      description: key.memo,
      allowed_ips: key.allowedIps ? JSON.parse(key.allowedIps) : [],
      last_used_at: key.lastUsedAt,
      created_at: key.createdAt,
    })),
  }
})
