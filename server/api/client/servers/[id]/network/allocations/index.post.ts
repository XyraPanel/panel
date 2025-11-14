import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { randomUUID } from 'crypto'

interface CreateAllocationPayload {
  allocationId: string
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Server ID is required' })
  }

  const body = await readBody<CreateAllocationPayload>(event)

  if (!body.allocationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Allocation ID is required',
    })
  }

  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Server not found' })
  }

  if (server.ownerId !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const now = new Date()

  const newAllocation = {
    id: randomUUID(),
    nodeId: server.nodeId!,
    serverId,
    ip: '0.0.0.0',
    port: 25566,
    isPrimary: false,
    notes: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.serverAllocations).values(newAllocation)

  return {
    data: {
      id: newAllocation.id,
      serverId: newAllocation.serverId,
      ip: newAllocation.ip,
      port: newAllocation.port,
      isPrimary: newAllocation.isPrimary,
      createdAt: newAllocation.createdAt.toISOString(),
    },
  }
})
