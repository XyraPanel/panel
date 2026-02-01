import { type H3Event } from 'h3'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { getNodeIdFromAuth } from '#server/utils/wings/auth'
import { invalidateServerBackupsCache } from '#server/utils/backups'
import { remoteBackupStatusSchema } from '#shared/schema/wings'

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle()
  const { backupId } = event.context.params ?? {}

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing backup ID' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const { checksum, checksum_type, size, successful, parts } = await readValidatedBodyWithLimit(
    event,
    remoteBackupStatusSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const backup = db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupId))
    .limit(1)
    .get()

  if (!backup) {
    throw createError({ statusCode: 404, statusMessage: 'Backup not found' })
  }

  const updates = {
    checksum: successful ? `${checksum_type}:${checksum}` : null,
    bytes: successful ? size : 0,
    completedAt: new Date(),
    isSuccessful: successful,
    isLocked: successful ? backup.isLocked : false,
    updatedAt: new Date(),
  }

  db.update(tables.serverBackups)
    .set(updates)
    .where(eq(tables.serverBackups.id, backup.id))
    .run()
  await invalidateServerBackupsCache(backup.serverId)

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, backup.serverId))
    .limit(1)
    .get()

  await recordAuditEventFromRequest(event, {
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server:backup.complete' : 'server:backup.fail',
    targetType: 'backup',
    targetId: backupId,
    metadata: {
      node_id: nodeId,
      server_uuid: server?.uuid,
      checksum: successful ? `${checksum_type}:${checksum}` : undefined,
      size: successful ? size : 0,
      successful,
      parts: parts?.length || 0,
    },
  })

  return {
    data: {
      success: true,
    },
  }
})
