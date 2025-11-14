import { createError, readMultipartFormData, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteUploadFiles } from '~~/server/utils/wings/registry'

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.upload'],
  })

  const formData = await readMultipartFormData(event)

  if (!formData) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'No form data provided',
    })
  }

  const directory = formData.find(field => field.name === 'directory' && typeof field.data === 'string')?.data as string | undefined
  const files = formData.filter(field => field.name === 'files' && field.type === 'file')

  if (!directory) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Target directory is required',
    })
  }

  if (files.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'At least one file is required for upload',
    })
  }

  try {
    await remoteUploadFiles(
      context.server.uuid,
      directory,
      files.map(file => ({
        name: file.filename ?? 'upload.bin',
        data: file.data,
        mime: file.type,
      })),
      context.node?.id,
    )

    return {
      success: true,
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to upload files',
      cause: error,
    })
  }
})
