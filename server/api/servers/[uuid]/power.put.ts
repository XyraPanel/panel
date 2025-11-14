import { createError } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const uuid = getRouterParam(event, 'uuid')
  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  const body = await readBody(event)
  const { state } = body

  const validStates = ['starting', 'running', 'stopping', 'stopped', 'offline']
  if (!state || !validStates.includes(state)) {
    throw createError({
      statusCode: 400,
      message: `Invalid state. Must be one of: ${validStates.join(', ')}`,
    })
  }

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  db.update(tables.servers)
    .set({
      status: state === 'running' ? null : state,
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, server.id))
    .run()

  return {
    success: true,
    message: `Server power state updated to: ${state}`,
  }
})
