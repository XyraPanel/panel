
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

  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  const body = await readBody(event)
  const { name, ignored } = body

  const { useDrizzle, tables, eq } = await import('../../../../../utils/drizzle')
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

  const { requireServerPermission } = await import('../../../../../utils/api-helpers')
  await requireServerPermission(event, server.id, 'backup.create')

  const { getWingsClientForServer } = await import('../../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {
    const backup = await client.createBackup(uuid, name, ignored)

    const backupId = crypto.randomUUID()
    const now = new Date()
    db.insert(tables.serverBackups).values({
      id: backupId,
      serverId: server.id,
      uuid: backup.uuid,
      name: backup.name || name || `backup-${Date.now()}`,
      ignoredFiles: backup.ignored_files?.join(',') || ignored || '',
      bytes: backup.bytes || 0,
      checksum: backup.sha256_hash || '',
      isSuccessful: true,
      isLocked: false,
      createdAt: new Date(backup.created_at),
      completedAt: backup.completed_at ? new Date(backup.completed_at) : null,
      updatedAt: now,
    }).run()

    return {
      success: true,
      data: backup,
      message: 'Backup creation started',
    }
  } catch (error) {
    console.error('Failed to create backup:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to create backup',
    })
  }
})
