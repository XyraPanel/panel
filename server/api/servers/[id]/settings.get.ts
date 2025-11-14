import { createError, defineEventHandler } from 'h3'
import { getServerSession } from '#auth'
import { eq } from 'drizzle-orm'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(id)

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  if (user.role !== 'admin' && server.ownerId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()
  const limits = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .get()

  return {
    data: {
      server: {
        id: server.id,
        uuid: server.uuid,
        identifier: server.identifier,
        name: server.name,
        description: server.description,
        suspended: server.suspended,
      },
      limits: limits ? {
        cpu: limits.cpu,
        memory: limits.memory,
        disk: limits.disk,
        swap: limits.swap,
        io: limits.io,
      } : null,
    },
  }
})
