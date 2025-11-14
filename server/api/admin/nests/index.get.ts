import { eq, sql } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { NestWithEggCount } from '#shared/types/admin-nests'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()

  const nests = await db
    .select({
      id: tables.nests.id,
      uuid: tables.nests.uuid,
      author: tables.nests.author,
      name: tables.nests.name,
      description: tables.nests.description,
      createdAt: tables.nests.createdAt,
      updatedAt: tables.nests.updatedAt,
      eggCount: sql<number>`count(${tables.eggs.id})`.as('eggCount'),
    })
    .from(tables.nests)
    .leftJoin(tables.eggs, eq(tables.eggs.nestId, tables.nests.id))
    .groupBy(tables.nests.id)
    .orderBy(tables.nests.name)
    .all()

  const data: NestWithEggCount[] = nests.map(nest => ({
    id: nest.id,
    uuid: nest.uuid,
    author: nest.author,
    name: nest.name,
    description: nest.description,
    createdAt: new Date(nest.createdAt).toISOString(),
    updatedAt: new Date(nest.updatedAt).toISOString(),
    eggCount: Number(nest.eggCount) || 0,
  }))

  return { data }
})
