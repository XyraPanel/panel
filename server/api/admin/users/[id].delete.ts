import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { getSessionUser, isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'User ID is required' })
  }

  const db = useDrizzle()
  const actingUser = getSessionUser(session)

  const existing = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }

  if (actingUser && userId === actingUser.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Cannot delete your own account',
    })
  }

  await db.delete(tables.users).where(eq(tables.users.id, userId)).run()

  return { success: true }
})
