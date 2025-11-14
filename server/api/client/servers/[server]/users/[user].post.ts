import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

interface UpdateSubuserPayload {
  permissions: string[]
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const subuserId = getRouterParam(event, 'user')

  if (!serverId || !subuserId) {
    throw createError({
      statusCode: 400,
      message: 'Server and user identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const body = await readBody<UpdateSubuserPayload>(event)

  const db = useDrizzle()
  const subuser = db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(
        eq(tables.serverSubusers.id, subuserId),
        eq(tables.serverSubusers.serverId, server.id)
      )
    )
    .get()

  if (!subuser) {
    throw createError({
      statusCode: 404,
      message: 'Subuser not found',
    })
  }

  db.update(tables.serverSubusers)
    .set({
      permissions: JSON.stringify(body.permissions),
      updatedAt: new Date(),
    })
    .where(eq(tables.serverSubusers.id, subuserId))
    .run()

  const result = db
    .select({
      subuser: tables.serverSubusers,
      user: tables.users,
    })
    .from(tables.serverSubusers)
    .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
    .where(eq(tables.serverSubusers.id, subuserId))
    .get()

  return {
    data: {
      id: result!.subuser.id,
      user: {
        id: result!.user!.id,
        username: result!.user!.username,
        email: result!.user!.email,
        image: result!.user!.image,
      },
      permissions: JSON.parse(result!.subuser.permissions),
      created_at: result!.subuser.createdAt,
      updated_at: result!.subuser.updatedAt,
    },
  }
})
