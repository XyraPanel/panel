import { requireServerPermission } from '#server/utils/permission-middleware'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { recordServerActivity } from '#server/utils/server-activity'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverIdentifier = getRouterParam(event, 'server')

  if (!serverIdentifier) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session)

  const body = await readBody(event)
  const { root, files } = body

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Files array is required',
    })
  }

  const permissionContext = await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.compress'],
  })

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    const result = await client.compressFiles(server.uuid as string, root || '/', files) as { archive?: string } | undefined

    await recordServerActivity({
      event,
      actorId: permissionContext.userId,
      action: 'server.file.compress',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: {
        root: root || '/',
        files,
        archive: typeof result?.archive === 'string' ? result.archive : undefined,
      },
    })

    return {
      success: true,
      message: 'Files compressed successfully',
      data: result,
    }
  } catch (error) {
    console.error('Failed to compress files on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to compress files',
    })
  }
})
