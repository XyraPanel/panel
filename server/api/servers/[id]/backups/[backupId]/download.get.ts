import { createError } from 'h3'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  const backupId = event.context.params?.backupId

  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing backup identifier' })
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

  const db = useDrizzle()

  const backup = await db
    .select()
    .from(tables.serverBackups)
    .where(and(
      eq(tables.serverBackups.id, backupId),
      eq(tables.serverBackups.serverId, server.id),
    ))
    .get()

  if (!backup) {
    throw createError({ statusCode: 404, statusMessage: 'Backup not found' })
  }

  if (!server.nodeId) {
    throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    const downloadUrl = client.getBackupDownloadUrl(server.uuid, backup.uuid)

    return {
      data: {
        url: downloadUrl,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to get backup download URL',
    })
  }
})
