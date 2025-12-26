import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { getWingsClientForServer, WingsConnectionError } from '~~/server/utils/wings-client'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { invalidateServerBackupsCache } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const backupUuid = getRouterParam(event, 'backup')

  if (!serverId || !backupUuid) {
    throw createError({
      statusCode: 400,
      message: 'Server and backup identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const backup = db.select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupUuid))
    .limit(1)
    .all()
    .at(0)

  if (!backup || backup.serverId !== server.id) {
    throw createError({
      statusCode: 404,
      message: 'Backup not found',
    })
  }

  if (backup.isLocked) {
    throw createError({
      statusCode: 403,
      message: 'Cannot delete locked backup',
    })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    try {
      await client.deleteBackup(server.uuid, backupUuid)
    } catch (error) {
      if (error instanceof WingsConnectionError && error.message.includes('404')) {
        console.warn(`Backup ${backupUuid} missing on Wings, removing record locally.`)
      }
      else {
        throw error
      }
    }

    db.delete(tables.serverBackups)
      .where(eq(tables.serverBackups.id, backup.id))
      .run()
    await invalidateServerBackupsCache(server.id as string)

    return {
      success: true,
      message: 'Backup deleted successfully',
    }
  } catch (error) {
    console.error('Failed to delete backup:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to delete backup',
    })
  }
})
