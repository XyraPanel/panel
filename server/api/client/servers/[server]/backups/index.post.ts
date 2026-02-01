import { backupManager } from '#server/utils/backup-manager'
import { WingsConnectionError, WingsAuthError } from '#server/utils/wings-client'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.create'],
  })

  const body = await readBody<{ name?: string; ignored?: string }>(event)
  const { name, ignored } = body

  try {
    const backup = await backupManager.createBackup(server.id, {
      name,
      ignoredFiles: ignored,
      userId: accountContext.user.id,
    })

    const serializeDate = (value: Date | string | null | undefined) => {
      if (value instanceof Date) {
        return value.toISOString()
      }
      return value ?? null
    }

    return {
      success: true,
      data: {
        id: backup.id,
        uuid: backup.uuid,
        name: backup.name,
        size: backup.size,
        isSuccessful: backup.isSuccessful,
        isLocked: backup.isLocked,
        checksum: backup.checksum,
        ignoredFiles: backup.ignoredFiles,
        completedAt: serializeDate(backup.completedAt),
        createdAt: serializeDate(backup.createdAt),
      },
    }
  } catch (error) {
    console.error('Failed to create backup:', error)
    
    if (error instanceof WingsAuthError) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Wings authentication failed',
      })
    }
    
    if (error instanceof WingsConnectionError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Wings daemon unavailable',
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create backup',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
