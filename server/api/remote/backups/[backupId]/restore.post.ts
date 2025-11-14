import { createError, readBody, type H3Event } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { getNodeIdFromAuth } from '~~/server/utils/wings/auth'

interface RestoreStatusRequest {
  successful: boolean
}

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle()
  const { backupId } = event.context.params ?? {}

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing backup ID' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const body = await readBody<RestoreStatusRequest>(event)
  const { successful } = body

  const backup = db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupId))
    .limit(1)
    .get()

  if (!backup) {
    throw createError({ statusCode: 404, statusMessage: 'Backup not found' })
  }

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, backup.serverId))
    .limit(1)
    .get()

  if (server) {

    db.update(tables.servers)
      .set({
        status: successful ? null : 'restore_failed',
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.id, server.id))
      .run()
  }

  await recordAuditEvent({
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server:backup.restore-complete' : 'server:backup.restore-failed',
    targetType: 'backup',
    targetId: backupId,
    metadata: {
      node_id: nodeId,
      server_uuid: server?.uuid,
      successful,
    },
  })

  return {
    success: true,
  }
})
