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

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const subusers = db
    .select({
      subuser: tables.serverSubusers,
      user: tables.users,
    })
    .from(tables.serverSubusers)
    .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
    .where(eq(tables.serverSubusers.serverId, server.id))
    .all()

  return {
    data: subusers.map(({ subuser, user }) => ({
      id: subuser.id,
      user: {
        id: user!.id,
        username: user!.username,
        email: user!.email,
        image: user!.image,
      },
      permissions: JSON.parse(subuser.permissions),
      created_at: subuser.createdAt,
      updated_at: subuser.updatedAt,
    })),
  }
})
