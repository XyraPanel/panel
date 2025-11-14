import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Server ID is required' })
  }

  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Server not found' })
  }

  if (server.ownerId !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  await db
    .update(tables.servers)
    .set({
      status: 'installing',
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, serverId))

  try {
    const { getWingsClientForServer } = await import('~~/server/utils/wings-client')
    const { client } = await getWingsClientForServer(server.uuid)
    await client.reinstallServer(server.uuid)

    return {
      success: true,
      message: 'Server reinstall initiated',
    }
  } catch (error) {
    console.error('Failed to trigger reinstall on Wings:', error)

    await db
      .update(tables.servers)
      .set({ status: 'offline' })
      .where(eq(tables.servers.id, serverId))
      .run()

    throw createError({
      statusCode: 500,
      message: 'Failed to trigger server reinstall',
    })
  }
})
