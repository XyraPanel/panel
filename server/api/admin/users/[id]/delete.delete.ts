import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { count } from 'drizzle-orm'
import { getSessionUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const sessionUser = getSessionUser(session)

  if (sessionUser?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'User ID is required',
    })
  }

  const db = useDrizzle()

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, id))
    .get()

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found',
    })
  }

  const serverCountResult = db
    .select({ serversOwned: count() })
    .from(tables.servers)
    .where(eq(tables.servers.ownerId, id))
    .all()

  const serversOwned = serverCountResult[0]?.serversOwned ?? 0

  if (serversOwned > 0) {
    throw createError({
      statusCode: 400,
      message: `Cannot delete user: owns ${serversOwned} server(s). Transfer or delete servers first.`,
    })
  }

  db.delete(tables.users)
    .where(eq(tables.users.id, id))
    .run()

  return {
    success: true,
    message: 'User deleted successfully',
  }
})
