import { eq, and } from 'drizzle-orm'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { useDrizzle } from '#server/utils/drizzle'
import * as tables from '#server/database/schema'
import { requireAccountUser } from '#server/utils/security'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id')
  const backupId = getRouterParam(event, 'backupId')

  if (!identifier) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  if (!backupId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing backup identifier' })
  }

  const { user, session } = await requireAccountUser(event)
  const { server } = await getServerWithAccess(identifier, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.delete'],
  })

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

    await client.deleteBackup(server.uuid, backup.uuid)

    await db
      .delete(tables.serverBackups)
      .where(eq(tables.serverBackups.id, backupId))

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.backup.deleted',
      targetType: 'server',
      targetId: server.id,
      metadata: { backupId },
    })

    return {
      data: {
        success: true,
        message: 'Backup deleted successfully',
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to delete backup',
    })
  }
})
