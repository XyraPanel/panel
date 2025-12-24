import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { listServerBackups } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const backups = await listServerBackups(server.id)

  return {
    object: 'list',
    data: backups.map(backup => ({
      object: 'backup',
      attributes: {
        uuid: backup.uuid,
        name: backup.name,
        ignored_files: backup.ignoredFiles,
        sha256_hash: backup.checksum,
        bytes: backup.bytes,
        created_at: backup.createdAt,
        completed_at: backup.completedAt,
        is_successful: backup.isSuccessful,
        is_locked: backup.isLocked,
      },
    })),
  }
})
