import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const envVars = db.select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, serverId))
    .all()

  const environment: Record<string, string> = {}
  for (const envVar of envVars) {
    environment[envVar.key] = envVar.value
  }

  return {
    data: {
      startup: server.startup || '',
      dockerImage: server.dockerImage || '',
      environment,
    },
  }
})
