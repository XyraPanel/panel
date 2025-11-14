import { createError, getQuery, type H3Event } from 'h3'
import { remoteListServerDirectory } from '~~/server/utils/wings/registry'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.read'],
  })

  const query = getQuery(event)
  const directory = typeof query.directory === 'string' ? query.directory : '/'

  try {
    const listing = await remoteListServerDirectory(context.server.uuid, directory, context.node?.id ?? undefined)
    return { data: listing }
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Wings request failed',
      message: error instanceof Error ? error.message : 'Unable to list server directory.',
      cause: error,
    })
  }
})
