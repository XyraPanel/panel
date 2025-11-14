import { createError, defineEventHandler } from 'h3'
import { desc, sql } from 'drizzle-orm'

import type { AdminWingsNodeDetail, AdminWingsNodeAllocationSummary, AdminWingsNodeServerSummary } from '#shared/types/admin-wings-node'

import { getWingsNode } from '~~/server/utils/wings/nodesStore'
import { remoteGetSystemInformation } from '~~/server/utils/wings/registry'
import { isH3Error } from '~~/server/utils/wings/http'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString()
  }

  if (typeof value === 'bigint') {
    return new Date(Number(value)).toISOString()
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (!Number.isNaN(numeric) && numeric > 0) {
      return new Date(numeric).toISOString()
    }

    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }
  }

  return new Date().toISOString()
}

export default defineEventHandler(async (event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const session = await getServerSession(event)

  console.log('[Node Detail] Session:', JSON.stringify(session?.user, null, 2))
  console.log('[Node Detail] isAdmin:', isAdmin(session))

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()
  const node = getWingsNode(id)

  const serversTotalRow = db.select({ count: sql<number>`COUNT(*)` })
    .from(tables.servers)
    .where(eq(tables.servers.nodeId, id))
    .get()

  const allocationsTotalRow = db.select({ count: sql<number>`COUNT(*)` })
    .from(tables.serverAllocations)
    .innerJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id))
    .get()

  const resourceTotals = db.select({
    memory: sql<number>`COALESCE(SUM(${tables.serverLimits.memory}), 0)`,
    disk: sql<number>`COALESCE(SUM(${tables.serverLimits.disk}), 0)`,
  })
    .from(tables.serverLimits)
    .innerJoin(tables.servers, eq(tables.serverLimits.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id))
    .get()

  const recentServersRows = db.select({
    id: tables.servers.id,
    uuid: tables.servers.uuid,
    identifier: tables.servers.identifier,
    name: tables.servers.name,
    createdAt: tables.servers.createdAt,
    updatedAt: tables.servers.updatedAt,
    primaryIp: tables.serverAllocations.ip,
    primaryPort: tables.serverAllocations.port,
  })
    .from(tables.servers)
    .leftJoin(
      tables.serverAllocations,
      sql`${tables.serverAllocations.serverId} = ${tables.servers.id} AND ${tables.serverAllocations.isPrimary} = 1`,
    )
    .where(eq(tables.servers.nodeId, id))
    .orderBy(desc(tables.servers.updatedAt))
    .limit(5)
    .all()

  const allocationRows = db.select({
    id: tables.serverAllocations.id,
    ip: tables.serverAllocations.ip,
    port: tables.serverAllocations.port,
    isPrimary: tables.serverAllocations.isPrimary,
    serverId: tables.serverAllocations.serverId,
    serverName: tables.servers.name,
    serverIdentifier: tables.servers.identifier,
  })
    .from(tables.serverAllocations)
    .innerJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id))
    .orderBy(desc(tables.serverAllocations.isPrimary), desc(tables.serverAllocations.createdAt))
    .limit(25)
    .all()

  const recentServers: AdminWingsNodeServerSummary[] = recentServersRows.map(row => ({
    id: row.id,
    uuid: row.uuid,
    identifier: row.identifier,
    name: row.name,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
    primaryAllocation: row.primaryIp && row.primaryPort
      ? { ip: row.primaryIp, port: row.primaryPort }
      : null,
  }))

  const allocations: AdminWingsNodeAllocationSummary[] = allocationRows.map(row => ({
    id: row.id,
    ip: row.ip,
    port: row.port,
    isPrimary: Boolean(row.isPrimary),
    serverId: row.serverId,
    serverName: row.serverName,
    serverIdentifier: row.serverIdentifier,
  }))

  let system: AdminWingsNodeDetail['system'] = null
  let systemError: string | null = null
  try {
    system = await remoteGetSystemInformation(id)
  }
  catch (error) {
    if (isH3Error(error)) {
      systemError = error.message || error.statusMessage || 'Failed to reach Wings node'
    }
    else if (error instanceof Error) {
      systemError = error.message
    }
    else {
      systemError = 'Failed to reach Wings node'
    }
  }

  const payload: AdminWingsNodeDetail = {
    node,
    stats: {
      serversTotal: serversTotalRow?.count ?? 0,
      allocationsTotal: allocationsTotalRow?.count ?? 0,
      maintenanceMode: node.maintenanceMode,
      memoryProvisioned: resourceTotals?.memory ?? 0,
      diskProvisioned: resourceTotals?.disk ?? 0,
      lastSeenAt: node.lastSeenAt,
    },
    recentServers,
    allocations,
    system,
    systemError,
  }

  return {
    data: payload,
  }
})
