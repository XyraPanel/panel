import { createError, readBody, type H3Event } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { recordAuditEvent } from '~~/server/utils/audit'
import type { ActivityAction } from '#shared/types/audit'
import { getNodeIdFromAuth } from '~~/server/utils/wings/auth'

interface ArchiveStatusRequest {
  successful: boolean
}

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle()
  const { uuid } = event.context.params ?? {}

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const body = await readBody<ArchiveStatusRequest>(event)
  const { successful } = body

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

  if (successful) {
    db.update(tables.servers)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.id, server.id))
      .run()
  }

  await recordAuditEvent({
    actor: 'wings-daemon',
    actorType: 'daemon',
    action: (successful ? 'server.archive_success' : 'server.archive_failed') as ActivityAction,
    targetType: 'server',
    targetId: uuid,
    metadata: {
      status: successful ? 'success' : 'failed',
      archivedAt: new Date().toISOString(),
    },
  })

  return {
    success: true,
  }
})
