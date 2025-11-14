import { eq, sql } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { LocationWithNodeCount } from '#shared/types/admin-locations'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()

  const locations = await db
    .select({
      id: tables.locations.id,
      short: tables.locations.short,
      long: tables.locations.long,
      createdAt: tables.locations.createdAt,
      updatedAt: tables.locations.updatedAt,
      nodeCount: sql<number>`count(${tables.wingsNodes.id})`.as('nodeCount'),
    })
    .from(tables.locations)
    .leftJoin(tables.wingsNodes, eq(tables.wingsNodes.locationId, tables.locations.id))
    .groupBy(tables.locations.id)
    .orderBy(tables.locations.short)
    .all()

  const data: LocationWithNodeCount[] = locations.map(loc => ({
    id: loc.id,
    short: loc.short,
    long: loc.long,
    createdAt: new Date(loc.createdAt).toISOString(),
    updatedAt: new Date(loc.updatedAt).toISOString(),
    nodeCount: Number(loc.nodeCount) || 0,
  }))

  return { data }
})
