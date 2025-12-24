import { createError } from 'h3'
import { eq, and, sql } from 'drizzle-orm'
import { getServerSession } from '~~/server/utils/session'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { findServerByIdentifier, getServerLimits, listServerAllocations } from '~~/server/utils/serversStore'
import { permissionManager } from '~~/server/utils/permission-manager'
import { getServerStatus } from '~~/server/utils/server-status'
import type { PanelServerDetails, ServerAllocationSummary } from '#shared/types/server'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(id)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  const db = useDrizzle()
  const userPermissions = await permissionManager.getUserPermissions(user.id)
  const serverPerms = userPermissions.serverPermissions.get(server.id) || []
  
  if (!isAdmin && !isOwner) {
    const subuser = await db
      .select()
      .from(tables.serverSubusers)
      .where(and(
        eq(tables.serverSubusers.serverId, server.id),
        eq(tables.serverSubusers.userId, user.id),
      ))
      .get()

    if (!subuser) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'You do not have access to this server' })
    }
  }

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
  const primaryAllocationRow = await db
    .select({
      ip: tables.serverAllocations.ip,
      port: tables.serverAllocations.port,
      notes: tables.serverAllocations.notes,
    })
    .from(tables.servers)
    .leftJoin(
      tables.serverAllocations,
      sql`${tables.serverAllocations.serverId} = ${tables.servers.id} AND ${tables.serverAllocations.isPrimary} = 1`
    )
    .where(eq(tables.servers.id, server.id))
    .limit(1)
    .get()
  
  const allAllocations = await listServerAllocations(server.id)
  const additionalAllocations = allAllocations.filter(allocation => !allocation.isPrimary)
  
  const allocationMapper = (allocation: { ip: string; port: number; notes?: string | null }): ServerAllocationSummary => ({
    ip: allocation.ip,
    port: allocation.port,
    description: allocation.notes ?? '',
  })
  
  const primaryAllocation = primaryAllocationRow?.ip && primaryAllocationRow?.port
    ? { ip: primaryAllocationRow.ip, port: primaryAllocationRow.port, notes: primaryAllocationRow.notes }
    : null

  let actualStatus = server.status ?? null
  let actualSuspended = Boolean(server.suspended)

  if (server.uuid) {
    try {
      const status = await getServerStatus(server.uuid)
      actualStatus = status.state || actualStatus
      actualSuspended = status.isSuspended ?? actualSuspended
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!errorMessage.includes('404') && !errorMessage.includes('not found')) {
        console.warn(`Failed to resolve cached status for server ${server.uuid}:`, errorMessage)
      }
    }
  }

  const response: PanelServerDetails = {
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
    name: server.name,
    description: server.description ?? null,
    status: actualStatus,
    suspended: actualSuspended,
    node: {
      id: nodeRow?.id ?? null,
      name: nodeRow?.name ?? null,
    },
    limits: {
      memory: limits?.memory ?? null,
      disk: limits?.disk ?? null,
      cpu: limits?.cpu ?? null,
      swap: null,
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
    permissions: serverPerms,
  }

  return {
    data: response,
  }
})
