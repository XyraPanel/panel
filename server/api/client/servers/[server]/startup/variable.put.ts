import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const body = await readBody(event)
  const { key, value } = body

  if (!key) {
    throw createError({
      statusCode: 400,
      message: 'Variable key is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const [eggVariable] = db.select()
    .from(tables.eggVariables)
    .where(
      and(
        eq(tables.eggVariables.eggId, server.eggId!),
        eq(tables.eggVariables.envVariable, key)
      )
    )
    .limit(1)
    .all()

  if (!eggVariable) {
    throw createError({
      statusCode: 404,
      message: 'Variable not found',
    })
  }

  if (!eggVariable.userEditable) {
    throw createError({
      statusCode: 403,
      message: 'This variable cannot be edited',
    })
  }

  const [existingVar] = db.select()
    .from(tables.serverEnvironmentVariables)
    .where(
      and(
        eq(tables.serverEnvironmentVariables.serverId, server.id),
        eq(tables.serverEnvironmentVariables.key, key)
      )
    )
    .limit(1)
    .all()

  const now = new Date()

  if (existingVar) {

    db.update(tables.serverEnvironmentVariables)
      .set({
        value: value || '',
        updatedAt: now,
      })
      .where(eq(tables.serverEnvironmentVariables.id, existingVar.id))
      .run()
  } else {

    db.insert(tables.serverEnvironmentVariables)
      .values({
        id: `env_${Date.now()}`,
        serverId: server.id,
        key,
        value: value || '',
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  return {
    object: 'egg_variable',
    attributes: {
      name: eggVariable.name,
      description: eggVariable.description,
      env_variable: eggVariable.envVariable,
      default_value: eggVariable.defaultValue,
      server_value: value || '',
      is_editable: eggVariable.userEditable,
      rules: eggVariable.rules || '',
    },
  }
})
