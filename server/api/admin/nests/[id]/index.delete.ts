import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const nestId = getRouterParam(event, 'id')
  if (!nestId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Nest ID is required' })
  }

  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.nests)
    .where(eq(tables.nests.id, nestId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Nest not found' })
  }

  const eggsCount = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.nestId, nestId))
    .all()

  if (eggsCount.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `Cannot delete nest with ${eggsCount.length} egg(s). Delete eggs first.`,
    })
  }

  await db.delete(tables.nests).where(eq(tables.nests.id, nestId))

  return { success: true }
})
