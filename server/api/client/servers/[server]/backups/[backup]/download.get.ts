import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { requireServerPermission } from '~~/server/utils/permission-middleware'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const backupUuid = getRouterParam(event, 'backup')

  if (!serverId || !backupUuid) {
    throw createError({
      statusCode: 400,
      message: 'Server and backup identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.download'],
  })

  const db = useDrizzle()
  const backup = db.select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupUuid))
    .limit(1)
    .all()
    .at(0)

  if (!backup || backup.serverId !== server.id) {
    throw createError({
      statusCode: 404,
      message: 'Backup not found',
    })
  }

  const { client } = await getWingsClientForServer(server.uuid)
  const response = await client.streamBackupDownload(server.uuid, backupUuid)

  const body = response.body
  if (!body) {
    throw createError({
      statusCode: 500,
      message: 'Failed to download backup',
    })
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const contentLength = response.headers.get('content-length')
  const fallbackName = `${backup.name || backup.uuid}.tar.gz`
  const contentDisposition = response.headers.get('content-disposition') ?? `attachment; filename="${fallbackName}"`

  event.node.res.setHeader('Content-Type', contentType)
  event.node.res.setHeader('Content-Disposition', contentDisposition)
  if (contentLength) {
    event.node.res.setHeader('Content-Length', contentLength)
  }

  return body
})
