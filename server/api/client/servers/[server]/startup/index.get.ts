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
  const [egg] = db.select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, server.eggId!))
    .limit(1)
    .all()

  if (!egg) {
    throw createError({
      statusCode: 404,
      message: 'Egg not found',
    })
  }

  const envVars = db.select()
    .from(tables.serverEnvironmentVariables)
    .where(eq(tables.serverEnvironmentVariables.serverId, server.id))
    .all()

  const envMap: Record<string, string> = {}
  for (const envVar of envVars) {
    envMap[envVar.key] = envVar.value
  }

  const eggVariables = db.select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.eggId, egg.id))
    .all()

  const variables = eggVariables.map(variable => ({
    name: variable.name,
    description: variable.description,
    env_variable: variable.envVariable,
    default_value: variable.defaultValue,
    server_value: envMap[variable.envVariable] || variable.defaultValue || '',
    is_editable: variable.userEditable,
    rules: variable.rules || '',
  }))

  return {
    data: {
      startup_command: server.startup || egg.startup || '',
      raw_startup_command: egg.startup || '',
      docker_images: {
        [egg.name]: egg.dockerImage || server.image || '',
      },
      variables,
    },
  }
})
