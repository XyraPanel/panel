import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const eggId = getRouterParam(event, 'id')
  const varId = getRouterParam(event, 'varId')

  if (!eggId || !varId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
  }

  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.id, varId))
    .get()

  if (!existing || existing.eggId !== eggId) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Variable not found' })
  }

  await db.delete(tables.eggVariables).where(eq(tables.eggVariables.id, varId))

  return { success: true }
})
