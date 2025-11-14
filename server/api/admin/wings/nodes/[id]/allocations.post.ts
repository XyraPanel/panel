import { defineEventHandler, readBody, createError } from 'h3'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const { id: nodeId } = event.context.params ?? {}
  if (!nodeId || typeof nodeId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const db = useDrizzle()

  const node = db.select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, nodeId))
    .get()

  if (!node) {
    throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  }

  const body = await readBody(event)

  if (!body.ip || !Array.isArray(body.ip) || body.ip.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one IP address is required' })
  }

  if (!body.ports || !Array.isArray(body.ports) || body.ports.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one port is required' })
  }

  const ipAddresses = body.ip as string[]
  const ports = body.ports as number[]
  const ipAlias = body.ipAlias as string | undefined

  const allocationsToCreate = []

  for (const ip of ipAddresses) {
    for (const port of ports) {

      const existing = db.select()
        .from(tables.serverAllocations)
        .where(and(
          eq(tables.serverAllocations.nodeId, nodeId),
          eq(tables.serverAllocations.ip, ip),
          eq(tables.serverAllocations.port, port),
        ))
        .get()

      if (existing) {
        continue
      }

      allocationsToCreate.push({
        id: randomUUID(),
        nodeId,
        ip,
        port,
        ipAlias: ipAlias || null,
        isPrimary: false,
        serverId: null,
        notes: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  }

  if (allocationsToCreate.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'All specified allocations already exist'
    })
  }

  db.insert(tables.serverAllocations).values(allocationsToCreate).run()

  return {
    success: true,
    created: allocationsToCreate.length,
    allocations: allocationsToCreate.map(a => ({
      id: a.id,
      ip: a.ip,
      port: a.port,
      ipAlias: a.ipAlias,
    })),
  }
})
