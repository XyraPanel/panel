import { getServerSession, isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()

  const nests = await db.select({
    id: tables.nests.id,
    name: tables.nests.name,
  }).from(tables.nests).all()

  const eggs = await db.select({
    id: tables.eggs.id,
    name: tables.eggs.name,
    nestId: tables.eggs.nestId,
  }).from(tables.eggs).all()

  const nestNames = nests.reduce<Record<string, string>>((acc, nest) => {
    acc[nest.id] = nest.name || nest.id
    return acc
  }, {})

  const data = eggs.map(egg => ({
    id: egg.id,
    name: egg.name,
    nestName: nestNames[egg.nestId] ?? null,
  }))

  return { data }
})
