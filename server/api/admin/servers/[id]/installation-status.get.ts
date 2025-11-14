import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { checkInstallationStatus } from '~~/server/utils/server-provisioning'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  try {
    const status = await checkInstallationStatus(server.uuid)

    if (server.status === 'installing' && status.status !== 'installing') {
      await db
        .update(tables.servers)
        .set({
          status: status.status === 'running' ? 'online' : 'offline',
          updatedAt: new Date(),
        })
        .where(eq(tables.servers.id, serverId))
        .run()
    }

    return {
      data: {
        status: status.status,
        installing: status.installing,
        serverStatus: server.status,
      },
    }
  } catch (error) {
    console.error('Failed to check installation status:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to check installation status',
    })
  }
})
