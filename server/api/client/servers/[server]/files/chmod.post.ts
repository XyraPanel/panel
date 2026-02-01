import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { requirePermission } from '#server/utils/permission-middleware'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { recordServerActivity } from '#server/utils/server-activity'
import { chmodBodySchema } from '#shared/schema/server/operations'

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { root, files } = await readValidatedBodyWithLimit(event, chmodBodySchema, BODY_SIZE_LIMITS.SMALL)
  const targetRoot = root && root.length > 0 ? root : '/'

  const { userId } = await requirePermission(event, 'server.files.write', serverId)

  try {
    const { client, server } = await getWingsClientForServer(serverId)
    await client.chmodFiles(server.uuid as string, targetRoot, files.map(entry => ({
      ...entry,
      mode: typeof entry.mode === 'number' ? String(entry.mode) : entry.mode,
    })))

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.file.chmod',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { root: targetRoot, files: files.map(f => ({ file: f.file, mode: f.mode })) },
    })

    return {
      data: {
        success: true,
        message: 'Permissions changed successfully',
      },
    }
  } catch (error) {
    console.error('Failed to change permissions on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to change permissions',
    })
  }
})
