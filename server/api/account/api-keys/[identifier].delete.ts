import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { getSessionUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const identifier = getRouterParam(event, 'identifier')
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  if (!identifier) {
    throw createError({ statusCode: 400, message: 'Identifier required' })
  }

  const db = useDrizzle()
  const key = db
    .select()
    .from(tables.apiKeys)
    .where(
      and(
        eq(tables.apiKeys.identifier, identifier),
        eq(tables.apiKeys.userId, user.id)
      )
    )
    .get()

  if (!key) {
    throw createError({ statusCode: 404, message: 'API key not found' })
  }

  db.delete(tables.apiKeys)
    .where(eq(tables.apiKeys.identifier, identifier))
    .run()

  return { success: true }
})
