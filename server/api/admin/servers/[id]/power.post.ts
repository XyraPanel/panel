import { defineEventHandler, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const { id: serverId } = event.context.params ?? {}
  if (!serverId || typeof serverId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server id' })
  }

  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const db = useDrizzle()

  const server = db.select({
    id: tables.servers.id,
    uuid: tables.servers.uuid,
    name: tables.servers.name,
    nodeId: tables.servers.nodeId,
  })
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  if (!server.nodeId) {
    throw createError({ statusCode: 400, statusMessage: 'Server has no assigned node' })
  }

  const body = await readBody(event)
  const action = body.action as string

  if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid power action' })
  }

  const node = db.select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId))
    .get()

  if (!node) {
    throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  }

  try {
    const { getWingsClientForServer } = await import('~~/server/utils/wings-client')
    const { client } = await getWingsClientForServer(server.uuid)

    await client.sendPowerAction(server.uuid, action as 'start' | 'stop' | 'restart' | 'kill')

    return {
      success: true,
      action,
      serverId: server.id,
      serverUuid: server.uuid,
      message: `Power action '${action}' sent to server ${server.name}`,
    }
  }
  catch (error) {
    const err = error as Error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to send power command: ${err.message}`,
    })
  }
})
