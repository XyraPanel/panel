import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

interface UpdateSubuserPayload {
  permissions: string[]
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  const subuserId = getRouterParam(event, 'subuserId')

  if (!serverId || !subuserId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
  }

  const body = await readBody<UpdateSubuserPayload>(event)

  if (!body.permissions || body.permissions.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Permissions are required',
    })
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

  const subuser = await db
    .select()
    .from(tables.serverSubusers)
    .where(and(eq(tables.serverSubusers.id, subuserId), eq(tables.serverSubusers.serverId, serverId)))
    .get()

  if (!subuser) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Subuser not found' })
  }

  await db
    .update(tables.serverSubusers)
    .set({
      permissions: JSON.stringify(body.permissions),
      updatedAt: new Date(),
    })
    .where(eq(tables.serverSubusers.id, subuserId))

  const targetUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, subuser.userId))
    .get()

  return {
    data: {
      id: subuser.id,
      serverId: subuser.serverId,
      userId: subuser.userId,
      username: targetUser?.username || 'Unknown',
      email: targetUser?.email || '',
      permissions: body.permissions,
      createdAt: new Date(subuser.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }
})
