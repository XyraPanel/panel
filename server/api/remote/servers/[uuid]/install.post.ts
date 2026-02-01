import { type H3Event } from 'h3'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { getNodeIdFromAuth } from '#server/utils/wings/auth'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { remoteServerInstallStatusSchema } from '#shared/schema/wings'

export default defineEventHandler(async (event: H3Event) => {
  assertMethod(event, 'POST')
  const db = useDrizzle()
  const { uuid } = event.context.params ?? {}

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const { successful, reinstall } = await readValidatedBodyWithLimit(
    event,
    remoteServerInstallStatusSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1)
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  if (server.nodeId !== nodeId) {
    throw createError({ statusCode: 403, statusMessage: 'Server does not belong to this node' })
  }

  const newStatus = successful ? null : 'install_failed'
  const now = new Date()

  const updatedFields: Partial<typeof tables.servers.$inferInsert> = {
    status: newStatus,
    updatedAt: now,
  }

  if (successful) {
    updatedFields.installedAt = now
  }

  db.update(tables.servers)
    .set(updatedFields)
    .where(eq(tables.servers.id, server.id))
    .run()

  await recordAuditEventFromRequest(event, {
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server.install_completed' : 'server.install_failed',
    targetType: 'server',
    targetId: server.uuid,
    metadata: {
      node_id: nodeId,
      reinstall,
      successful,
    },
  })

  return {
    data: {
      success: true,
      status: newStatus,
    },
  }
})
