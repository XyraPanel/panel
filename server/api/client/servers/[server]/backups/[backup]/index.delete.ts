import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

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
  const [backup] = db.select()
    .from(tables.serverBackups)
    .where(
      and(
        eq(tables.serverBackups.serverId, server.id),
        eq(tables.serverBackups.uuid, backupUuid)
      )
    )
    .limit(1)
    .all()

  if (!backup) {
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
    await client.deleteBackup(server.uuid, backupUuid)

    db.delete(tables.serverBackups)
      .where(eq(tables.serverBackups.id, backup.id))
      .run()

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
