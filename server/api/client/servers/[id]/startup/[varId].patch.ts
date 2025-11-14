import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

interface UpdateVariablePayload {
  value: string
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  const varId = getRouterParam(event, 'varId')

  if (!serverId || !varId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
  }

  const body = await readBody<UpdateVariablePayload>(event)

  if (body.value === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Value is required',
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

  const variable = await db
    .select()
    .from(tables.serverStartupEnv)
    .where(and(eq(tables.serverStartupEnv.id, varId), eq(tables.serverStartupEnv.serverId, serverId)))
    .get()

  if (!variable) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Variable not found' })
  }

  if (!variable.isEditable) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'This variable is not editable',
    })
  }

  await db
    .update(tables.serverStartupEnv)
    .set({
      value: body.value,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverStartupEnv.id, varId))

  return {
    data: {
      id: variable.id,
      serverId: variable.serverId,
      key: variable.key,
      value: body.value,
      description: variable.description,
      isEditable: Boolean(variable.isEditable),
      createdAt: new Date(variable.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }
})
