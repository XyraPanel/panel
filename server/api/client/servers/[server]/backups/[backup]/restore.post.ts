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

  const body = await readBody(event)
  const { truncate } = body

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

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.restoreBackup(server.uuid, backupUuid, truncate ?? false)

    return {
      success: true,
      message: 'Backup restore initiated',
    }
  } catch (error) {
    console.error('Failed to restore backup on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to restore backup',
    })
  }
})
