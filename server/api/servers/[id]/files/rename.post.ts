import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteRenameFiles } from '~~/server/utils/wings/registry'

interface RenameFileInstruction {
  from: string
  to: string
}

interface RenameFilesBody {
  root?: string
  files?: RenameFileInstruction[]
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.rename'],
  })

  const body = await readBody<RenameFilesBody>(event)
  const root = typeof body.root === 'string' && body.root.length > 0 ? body.root : '/'
  const files = Array.isArray(body.files) ? body.files.filter(instruction => instruction?.from && instruction?.to) : []

  if (files.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Rename instructions are required',
    })
  }

  try {
    await remoteRenameFiles(context.server.uuid, root, files, context.node?.id ?? undefined)

    return {
      success: true,
      data: {
        root,
        files,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to rename files',
      cause: error,
    })
  }
})
