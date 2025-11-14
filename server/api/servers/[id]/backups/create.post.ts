import { createError } from 'h3'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(identifier)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  if (!isAdmin && !isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  if (!server.nodeId) {
    throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    const result = await client.createBackup(server.uuid)

    const db = useDrizzle()
    const backupId = crypto.randomUUID()
    await db.insert(tables.serverBackups).values({
      id: backupId,
      serverId: server.id,
      uuid: result.uuid,
      name: `Backup ${new Date().toISOString()}`,
      ignoredFiles: JSON.stringify([]),
      disk: 'wings',
      checksum: null,
      bytes: 0,
      isSuccessful: false,
      isLocked: false,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return {
      success: true,
      data: {
        uuid: result.uuid,
        id: backupId,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to create backup',
    })
  }
})
