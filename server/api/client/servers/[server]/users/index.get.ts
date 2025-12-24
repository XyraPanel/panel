import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { listServerSubusers } from '~~/server/utils/subusers'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  return {
    data: (await listServerSubusers(server.id)).map((entry) => ({
      id: entry.id,
      user: {
        id: entry.userId,
        username: entry.username,
        email: entry.email,
        image: entry.image,
      },
      permissions: entry.permissions,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    })),
  }
})
