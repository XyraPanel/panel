import { remoteUploadFiles } from '#server/utils/wings/registry'
import { requireAccountUser } from '#server/utils/security'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id')
  if (!identifier) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const { user, session } = await requireAccountUser(event)
  const { server } = await getServerWithAccess(identifier, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.upload'],
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
    if (!server.nodeId) {
      throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
    }

    await remoteUploadFiles(
      server.uuid,
      directory,
      files.map(file => ({
        name: file.filename ?? 'upload.bin',
        data: file.data,
        mime: file.type,
      })),
      server.nodeId,
    )

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.upload',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        directory,
        fileCount: files.length,
      },
    })

    return {
      data: {
        success: true,
        uploaded: files.length,
      },
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
