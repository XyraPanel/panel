import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const mountId = getRouterParam(event, 'id')
  if (!mountId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Mount ID is required' })
  }

  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.mounts)
    .where(eq(tables.mounts.id, mountId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Mount not found' })
  }

  await db.delete(tables.mounts).where(eq(tables.mounts.id, mountId))

  return { success: true }
})
