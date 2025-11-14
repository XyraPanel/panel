import { getServerSession } from '#auth'
import { isAdmin, getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const user = getSessionUser(session)
  const keyId = getRouterParam(event, 'id')

  if (!keyId) {
    throw createError({
      statusCode: 400,
      message: 'API key ID is required',
    })
  }

  const db = useDrizzle()

  const key = db
    .select()
    .from(tables.apiKeys)
    .where(and(
      eq(tables.apiKeys.id, keyId),
      eq(tables.apiKeys.userId, user!.id),
    ))
    .get()

  if (!key) {
    throw createError({
      statusCode: 404,
      message: 'API key not found',
    })
  }

  db.delete(tables.apiKeys)
    .where(eq(tables.apiKeys.id, keyId))
    .run()

  return { success: true }
})
