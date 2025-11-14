import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  const allocId = getRouterParam(event, 'allocId')

  if (!serverId || !allocId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
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

  const allocation = await db
    .select()
    .from(tables.serverAllocations)
    .where(and(eq(tables.serverAllocations.id, allocId), eq(tables.serverAllocations.serverId, serverId)))
    .get()

  if (!allocation) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Allocation not found' })
  }

  if (allocation.isPrimary) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Cannot delete primary allocation',
    })
  }

  await db.delete(tables.serverAllocations).where(eq(tables.serverAllocations.id, allocId))

  return { success: true }
})
