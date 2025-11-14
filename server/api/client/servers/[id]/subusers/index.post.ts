import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { randomUUID } from 'crypto'

interface CreateSubuserPayload {
  email: string
  permissions: string[]
}

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

  const body = await readBody<CreateSubuserPayload>(event)

  if (!body.email || !body.permissions || body.permissions.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Email and permissions are required',
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

  const targetUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.email))
    .get()

  if (!targetUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'User with this email not found',
    })
  }

  const existing = await db
    .select()
    .from(tables.serverSubusers)
    .where(and(eq(tables.serverSubusers.serverId, serverId), eq(tables.serverSubusers.userId, targetUser.id)))
    .get()

  if (existing) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'User is already a subuser of this server',
    })
  }

  const now = new Date()

  const newSubuser = {
    id: randomUUID(),
    serverId,
    userId: targetUser.id,
    permissions: JSON.stringify(body.permissions),
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.serverSubusers).values(newSubuser)

  return {
    data: {
      id: newSubuser.id,
      serverId: newSubuser.serverId,
      userId: newSubuser.userId,
      username: targetUser.username,
      email: targetUser.email,
      permissions: body.permissions,
      createdAt: newSubuser.createdAt.toISOString(),
      updatedAt: newSubuser.updatedAt.toISOString(),
    },
  }
})
