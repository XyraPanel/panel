import { createError } from 'h3'
import { eq } from 'drizzle-orm'

import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { findServerByIdentifier, getServerLimits, listServerAllocations } from '~~/server/utils/serversStore'
import type { PanelServerDetails, ServerAllocationSummary } from '#shared/types/server-pages'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const server = await findServerByIdentifier(id)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Server not found' })
  }

  const db = useDrizzle()

  const nodeRow = server.nodeId
    ? await db
      .select({ id: tables.wingsNodes.id, name: tables.wingsNodes.name })
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, server.nodeId))
      .limit(1)
      .get()
    : null

  const ownerRow = server.ownerId
    ? await db
      .select({ id: tables.users.id, username: tables.users.username })
      .from(tables.users)
      .where(eq(tables.users.id, server.ownerId))
      .limit(1)
      .get()
    : null

  const limits = await getServerLimits(server.id)
  const allocations = await listServerAllocations(server.id)

  const allocationMapper = (allocation: typeof allocations[number]): ServerAllocationSummary => ({
    ip: allocation.ip,
    port: allocation.port,
    description: allocation.notes ?? '',
  })

  const primaryAllocation = allocations.find(allocation => allocation.isPrimary) ?? null
  const additionalAllocations = allocations.filter(allocation => !allocation.isPrimary)

  const response: PanelServerDetails = {
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
    name: server.name,
    description: server.description ?? null,
    status: server.status ?? null,
    suspended: Boolean(server.suspended),
    node: {
      id: nodeRow?.id ?? null,
      name: nodeRow?.name ?? null,
    },
    limits: {
      memory: limits?.memory ?? null,
      disk: limits?.disk ?? null,
      cpu: limits?.cpu ?? null,
      swap: limits?.swap ?? null,
      io: limits?.io ?? null,
    },
    createdAt: server.createdAt instanceof Date ? server.createdAt.toISOString() : new Date(server.createdAt).toISOString(),
    allocations: {
      primary: primaryAllocation ? allocationMapper(primaryAllocation) : null,
      additional: additionalAllocations.map(allocationMapper),
    },
    owner: {
      id: ownerRow?.id ?? null,
      username: ownerRow?.username ?? null,
    },
  }

  return {
    data: response,
  }
})
