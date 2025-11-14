import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const perPage = Math.min(Number(query.per_page) || 50, 100)
  const offset = (page - 1) * perPage

  const db = useDrizzle()

  const servers = db
    .select({
      server: tables.servers,
      owner: tables.users,
      node: tables.wingsNodes,
      egg: tables.eggs,
      nest: tables.nests,
    })
    .from(tables.servers)
    .leftJoin(tables.users, eq(tables.servers.ownerId, tables.users.id))
    .leftJoin(tables.wingsNodes, eq(tables.servers.nodeId, tables.wingsNodes.id))
    .leftJoin(tables.eggs, eq(tables.servers.eggId, tables.eggs.id))
    .leftJoin(tables.nests, eq(tables.servers.nestId, tables.nests.id))
    .limit(perPage)
    .offset(offset)
    .all()

  const total = db.select({ count: sql`count(*)` }).from(tables.servers).get()
  const totalCount = Number(total?.count ?? 0)

  return {
    data: servers.map(({ server, owner, node, egg, nest }) => ({
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
      external_id: server.externalId,
      name: server.name,
      description: server.description,
      status: server.status,
      suspended: server.suspended,
      owner: owner ? {
        id: owner.id,
        username: owner.username,
        email: owner.email,
      } : null,
      node: node ? {
        id: node.id,
        name: node.name,
      } : null,
      egg: egg ? {
        id: egg.id,
        name: egg.name,
      } : null,
      nest: nest ? {
        id: nest.id,
        name: nest.name,
      } : null,
      created_at: server.createdAt,
      updated_at: server.updatedAt,
    })),
    meta: {
      pagination: {
        total: totalCount,
        count: servers.length,
        per_page: perPage,
        current_page: page,
        total_pages: Math.ceil(totalCount / perPage),
      },
    },
  }
})
