import { createError, defineEventHandler } from 'h3'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { listServerAllocations, findServerByIdentifier } from '~~/server/utils/serversStore'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(id)

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  if (user.role !== 'admin' && server.ownerId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const allocations = await listServerAllocations(server.id)

  return {
    data: {
      primary: allocations.find(allocation => allocation.isPrimary) ?? null,
      allocations: allocations.filter(allocation => !allocation.isPrimary),
    },
  }
})
