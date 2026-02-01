import { type H3Event } from 'h3'
import { useDrizzle, tables, eq, and, inArray } from '#server/utils/drizzle'
import { getNodeIdFromAuth } from '#server/utils/wings/auth'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event: H3Event) => {
  assertMethod(event, 'POST')
  const db = useDrizzle()
  const { uuid, status } = event.context.params ?? {}

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  if (status !== 'success' && status !== 'failure') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid transfer status' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const successful = status === 'success'

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1)
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const transfer = db
    .select()
    .from(tables.serverTransfers)
    .where(and(
      eq(tables.serverTransfers.serverId, server.id),
      eq(tables.serverTransfers.archived, false),
    ))
    .orderBy(tables.serverTransfers.createdAt)
    .get()

  if (!transfer) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No active transfer',
      message: 'No transfer record found for this server.',
    })
  }

  const now = new Date()
  const oldAdditionalAllocations = parseAllocationList(transfer.oldAdditionalAllocations)
  const newAdditionalAllocations = parseAllocationList(transfer.newAdditionalAllocations)

  if (successful) {
    db.transaction((tx) => {
      const allocationsToRelease = [transfer.oldAllocation, ...oldAdditionalAllocations]

      if (allocationsToRelease.length > 0) {
        tx.update(tables.serverAllocations)
          .set({ serverId: null, updatedAt: now })
          .where(inArray(tables.serverAllocations.id, allocationsToRelease))
          .run()
      }

      const assignments = [transfer.newAllocation, ...newAdditionalAllocations]
      if (assignments.length > 0) {
        tx.update(tables.serverAllocations)
          .set({ serverId: server.id, updatedAt: now })
          .where(and(
            inArray(tables.serverAllocations.id, assignments),
            eq(tables.serverAllocations.nodeId, transfer.newNode),
          ))
          .run()
      }

      tx.update(tables.servers)
        .set({
          status: null,
          nodeId: transfer.newNode,
          allocationId: transfer.newAllocation,
          updatedAt: now,
        })
        .where(eq(tables.servers.id, server.id))
        .run()

      tx.update(tables.serverTransfers)
        .set({ successful: true, archived: true, updatedAt: now })
        .where(eq(tables.serverTransfers.id, transfer.id))
        .run()
    })
  }
  else {
    db.transaction((tx) => {
      const allocationsToRelease = [transfer.newAllocation, ...newAdditionalAllocations]
      if (allocationsToRelease.length > 0) {
        tx.update(tables.serverAllocations)
          .set({ serverId: null, updatedAt: now })
          .where(inArray(tables.serverAllocations.id, allocationsToRelease))
          .run()
      }

      tx.update(tables.servers)
        .set({ status: 'transfer_failed', updatedAt: now })
        .where(eq(tables.servers.id, server.id))
        .run()

      tx.update(tables.serverTransfers)
        .set({ successful: false, archived: true, updatedAt: now })
        .where(eq(tables.serverTransfers.id, transfer.id))
        .run()
    })
  }

  await recordAuditEventFromRequest(event, {
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server.transfer_completed' : 'server.transfer_failed',
    targetType: 'server',
    targetId: server.uuid,
    metadata: {
      node_id: nodeId,
      successful,
    },
  })

  return {
    data: {
      success: true,
      status: successful ? null : 'transfer_failed',
    },
  }
})

function parseAllocationList(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map(entry => String(entry))
      }
    }
    catch {
      return []
    }
  }

  if (Array.isArray(value)) {
    return value.map(entry => String(entry))
  }

  return []
}
