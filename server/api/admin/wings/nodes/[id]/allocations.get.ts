import { createError, defineEventHandler, getQuery } from 'h3'
import { asc, desc, sql } from 'drizzle-orm'

import type { AdminPaginatedMeta, AdminWingsNodeAllocationSummary, AdminWingsNodeAllocationsPayload } from '#shared/types/admin-wings-node'

import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event): Promise<AdminWingsNodeAllocationsPayload> => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const query = getQuery(event)
  const pageParam = typeof query.page === 'string' ? Number.parseInt(query.page, 10) : 1
  const perPageParam = typeof query.perPage === 'string' ? Number.parseInt(query.perPage, 10) : 25

  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const perPage = Number.isNaN(perPageParam) ? 25 : Math.min(Math.max(perPageParam, 1), 100)
  const offset = (page - 1) * perPage

  const db = useDrizzle()

  const totalRow = db.select({ count: sql<number>`COUNT(*)` })
    .from(tables.serverAllocations)
    .innerJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id))
    .get()

  const rows = db.select({
    id: tables.serverAllocations.id,
    ip: tables.serverAllocations.ip,
    port: tables.serverAllocations.port,
    isPrimary: tables.serverAllocations.isPrimary,
    createdAt: tables.serverAllocations.createdAt,
    serverId: tables.servers.id,
    serverName: tables.servers.name,
    serverIdentifier: tables.servers.identifier,
  })
    .from(tables.serverAllocations)
    .innerJoin(tables.servers, eq(tables.serverAllocations.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, id))
    .orderBy(desc(tables.serverAllocations.isPrimary), asc(tables.serverAllocations.ip), asc(tables.serverAllocations.port))
    .limit(perPage)
    .offset(offset)
    .all()

  const data: AdminWingsNodeAllocationSummary[] = rows.map(row => ({
    id: row.id,
    ip: row.ip,
    port: row.port,
    isPrimary: Boolean(row.isPrimary),
    serverId: row.serverId,
    serverName: row.serverName,
    serverIdentifier: row.serverIdentifier,
  }))

  const total = totalRow?.count ?? 0
  const pagination: AdminPaginatedMeta = {
    page,
    perPage,
    total,
    hasMore: offset + data.length < total,
  }

  return {
    data,
    pagination,
  }
})
