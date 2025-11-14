
export default defineEventHandler(async (event) => {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const uuid = getRouterParam(event, 'uuid')
  const backupId = getRouterParam(event, 'backupId')

  if (!uuid || !backupId) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID and backup ID are required',
    })
  }

  const { useDrizzle, tables, eq, and } = await import('../../../../../../utils/drizzle')
  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .get()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const backup = db
    .select()
    .from(tables.serverBackups)
    .where(and(
      eq(tables.serverBackups.serverId, server.id),
      eq(tables.serverBackups.uuid, backupId)
    ))
    .get()

  if (!backup) {
    throw createError({
      statusCode: 404,
      message: 'Backup not found',
    })
  }

  const { requireServerPermission } = await import('../../../../../../utils/api-helpers')
  await requireServerPermission(event, server.id, 'backup.download')

  const { getWingsClientForServer } = await import('../../../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {

    const downloadUrl = client.getBackupDownloadUrl(uuid, backupId)

    return {
      data: {
        url: downloadUrl,
      },
    }
  } catch (error) {
    console.error('Failed to get backup download URL:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to get backup download URL',
    })
  }
})
