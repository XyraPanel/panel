import { randomUUID } from 'crypto'
import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

interface CreateSubuserPayload {
  email: string
  permissions: string[]
}

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

  const body = await readBody<CreateSubuserPayload>(event)

  const db = useDrizzle()
  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.email))
    .get()

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found with that email address',
    })
  }

  const existing = db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(
        eq(tables.serverSubusers.serverId, server.id),
        eq(tables.serverSubusers.userId, user.id)
      )
    )
    .get()

  if (existing) {
    throw createError({
      statusCode: 400,
      message: 'User is already a subuser on this server',
    })
  }

  const subuserId = randomUUID()
  const now = new Date()

  db.insert(tables.serverSubusers)
    .values({
      id: subuserId,
      serverId: server.id,
      userId: user.id,
      permissions: JSON.stringify(body.permissions),
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const subuser = db
    .select()
    .from(tables.serverSubusers)
    .where(eq(tables.serverSubusers.id, subuserId))
    .get()

  return {
    data: {
      id: subuser!.id,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        image: user.image,
      },
      permissions: JSON.parse(subuser!.permissions),
      created_at: subuser!.createdAt,
      updated_at: subuser!.updatedAt,
    },
  }
})
