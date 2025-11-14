import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteDecompressFile } from '~~/server/utils/wings/registry'

interface DecompressBody {
  root: string
  file: string
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.decompress'],
  })

  const body = await readBody<DecompressBody>(event)

  if (!body.root || !body.file) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Root path and file are required',
    })
  }

  try {
    await remoteDecompressFile(context.server.uuid, body.root, body.file, context.node?.id)

    return {
      success: true,
      message: 'File decompressed successfully',
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to decompress file',
    })
  }
})
