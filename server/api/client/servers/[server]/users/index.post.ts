import { randomUUID } from 'crypto'
import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '~~/server/utils/security'
import { createSubuserSchema } from '#shared/schema/server/subusers'
import { invalidateServerSubusersCache } from '~~/server/utils/subusers'

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

  const body = await readValidatedBodyWithLimit(
    event,
    createSubuserSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

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

  await invalidateServerSubusersCache(server.id, [user.id])

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
