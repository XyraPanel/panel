import { getServerWithAccess } from '#server/utils/server-helpers'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.write'],
  })

  const body = await readBody(event)
  const { location } = body

  if (!location) {
    throw createError({
      statusCode: 400,
      message: 'File location is required',
    })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.copyFile(server.uuid, location)

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.id,
      actorType: 'user',
      action: 'server.file.copy',
      targetType: 'server',
      targetId: server.id,
      metadata: { location },
    })

    return {
      success: true,
      message: 'File copied successfully',
    }
  } catch (error) {
    console.error('Failed to copy file on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to copy file',
    })
  }
})
