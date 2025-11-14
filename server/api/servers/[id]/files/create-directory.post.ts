import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteCreateDirectory } from '~~/server/utils/wings/registry'

interface CreateDirectoryBody {
  root?: string
  name?: string
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.create'],
  })

  const body = await readBody<CreateDirectoryBody>(event)
  const name = body.name?.trim()
  const root = typeof body.root === 'string' && body.root.length > 0 ? body.root : '/'

  if (!name) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Directory name is required',
    })
  }

  try {
    await remoteCreateDirectory(context.server.uuid, root, name, context.node?.id ?? undefined)

    return {
      success: true,
      data: {
        name,
        root,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to create directory',
      cause: error,
    })
  }
})
