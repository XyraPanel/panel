import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  const backupId = getRouterParam(event, 'backupId')

  if (!serverId || !backupId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
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

  const backup = await db
    .select()
    .from(tables.serverBackups)
    .where(and(eq(tables.serverBackups.id, backupId), eq(tables.serverBackups.serverId, serverId)))
    .get()

  if (!backup) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Backup not found' })
  }

  if (!backup.isSuccessful) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Backup is not complete',
    })
  }

  return {
    data: {
      url: `/api/wings/backups/${backup.uuid}/download`,
    },
  }
})
