import { assertMethod, createError, readValidatedBody, type H3Event } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { getNodeIdFromAuth } from '~~/server/utils/wings/auth'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

interface InstallStatusRequest {
  successful: boolean
  reinstall: boolean
}

export default defineEventHandler(async (event: H3Event) => {
  assertMethod(event, 'POST')
  const db = useDrizzle()
  const { uuid } = event.context.params ?? {}

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const { successful, reinstall } = await readValidatedBody(event, (payload) => {
    if (!payload || typeof payload !== 'object') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
    }

    const candidate = payload as InstallStatusRequest

    if (typeof candidate.successful !== 'boolean' || typeof candidate.reinstall !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'Missing install status fields' })
    }

    return candidate
  })

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

  db.update(tables.servers)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
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
    success: true,
    status: newStatus,
  }
})
