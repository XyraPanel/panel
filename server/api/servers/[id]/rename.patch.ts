import { getServerSession, getSessionUser  } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({ statusCode: 400, statusMessage: 'Server ID required' })
  }

  const body = await readBody<{ name: string }>(event)

  if (!body.name || body.name.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Server name is required' })
  }

  if (body.name.length > 255) {
    throw createError({ statusCode: 400, statusMessage: 'Server name must be 255 characters or less' })
  }

  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  if (!isAdmin && !isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to rename this server' })
  }

  db.update(tables.servers)
    .set({
      name: body.name.trim(),
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.uuid, serverId))
    .run()

  const { invalidateServerCaches } = await import('~~/server/utils/serversStore')
  await invalidateServerCaches({
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
  })

  return {
    success: true,
    message: 'Server renamed successfully',
    data: {
      name: body.name.trim(),
    },
  }
})
