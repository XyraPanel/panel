import { createError, getQuery, type H3Event } from 'h3'
import { remoteGetFileContents } from '~~/server/utils/wings/registry'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.read'],
  })

  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : null

  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing file path' })
  }

  try {
    const result = await remoteGetFileContents(context.server.uuid, file, context.node?.id ?? undefined)
    return { data: result }
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Wings request failed',
      message: error instanceof Error ? error.message : 'Unable to read file contents.',
      cause: error,
    })
  }
})
