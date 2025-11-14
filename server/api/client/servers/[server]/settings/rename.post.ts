import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const body = await readBody(event)
  const { name, description } = body

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Server name is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  db.update(tables.servers)
    .set({
      name,
      description: description || server.description,
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, server.id))
    .run()

  return {
    object: 'server',
    attributes: {
      name,
      description: description || server.description,
    },
  }
})
