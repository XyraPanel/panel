import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const body = await readBody(event)
  const { name, ignored } = body

  const { server } = await getServerWithAccess(serverId, session)

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    const backupData = await client.createBackup(server.uuid, name, ignored)

    const db = useDrizzle()
    const backupId = `backup_${Date.now()}`
    const now = new Date()

    db.insert(tables.serverBackups)
      .values({
        id: backupId,
        serverId: server.id,
        uuid: backupData.uuid || backupId,
        name: name || `Backup ${new Date().toISOString()}`,
        ignoredFiles: ignored ? JSON.stringify(ignored.split('\n')) : null,
        disk: 'wings',
        checksum: null,
        bytes: 0,
        isSuccessful: false,
        isLocked: false,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return {
      object: 'backup',
      attributes: {
        uuid: backupData.uuid || backupId,
        name: name || `Backup ${new Date().toISOString()}`,
        ignored_files: ignored ? ignored.split('\n') : [],
        bytes: 0,
        created_at: now,
        completed_at: null,
        is_successful: false,
        is_locked: false,
      },
    }
  } catch (error) {
    console.error('Failed to create backup on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create backup',
    })
  }
})
