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
  const eggVariables = db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.eggId, server.eggId!))
    .all()

  const serverEnv = db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, server.id))
    .all()

  const serverValues = new Map(
    serverEnv.map(env => [env.key, env.value])
  )

  const variables = eggVariables.map(eggVar => ({
    name: eggVar.name,
    description: eggVar.description,
    env_variable: eggVar.envVariable,
    default_value: eggVar.defaultValue,
    server_value: serverValues.get(eggVar.envVariable) || eggVar.defaultValue,
    is_editable: eggVar.userEditable,
    rules: eggVar.rules,
  }))

  return {
    data: {
      startup_command: server.startup,
      docker_image: server.dockerImage || server.image,
      variables,
    },
  }
})
