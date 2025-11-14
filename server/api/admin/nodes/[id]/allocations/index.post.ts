import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const nodeId = getRouterParam(event, 'id')
  if (!nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Node ID is required',
    })
  }

  const body = await readBody(event)
  const { ip, ports, ipAlias } = body

  if (!ip || !ports || !Array.isArray(ports)) {
    throw createError({
      statusCode: 400,
      message: 'IP and ports array are required',
    })
  }

  const db = useDrizzle()
  const now = new Date()
  const created = []

  for (const port of ports) {
    const id = `alloc_${nodeId}_${ip}_${port}_${Date.now()}`

    try {
      db.insert(tables.serverAllocations)
        .values({
          id,
          nodeId,
          serverId: null,
          ip,
          port,
          ipAlias: ipAlias || null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      created.push({ id, ip, port })
    } catch (error) {

      console.error(`Failed to create allocation ${ip}:${port}`, error)
    }
  }

  return {
    success: true,
    message: `Created ${created.length} allocations`,
    data: created,
  }
})
