import { getServerSession, isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()
  const nodes = await db
    .select({
      id: tables.wingsNodes.id,
      name: tables.wingsNodes.name,
    })
    .from(tables.wingsNodes)
    .orderBy(tables.wingsNodes.name)
    .all()

  return { data: nodes }
})
