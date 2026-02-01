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
    requiredPermissions: ['server.files.delete'],
  })

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.deleteFiles(server.uuid as string, root || '/', files)

    await recordServerActivity({
      event,
      actorId: permissionContext.userId,
      action: 'server.file.delete',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { root: root || '/', files },
    })

    return {
      success: true,
      message: 'Files deleted successfully',
    }
  } catch {
    throw createError({
      statusCode: 500,
      message: 'Failed to delete files',
    })
  }
})
