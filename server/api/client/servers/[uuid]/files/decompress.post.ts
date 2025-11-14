
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
  const { root, file } = body

  if (!root || !file) {
    throw createError({
      statusCode: 400,
      message: 'Root directory and file are required',
    })
  }

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
  await requireServerPermission(event, server.id, 'file.archive')

  const { getWingsClientForServer } = await import('../../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {
    await client.decompressFile(uuid, root, file)

    return {
      success: true,
      message: 'File decompressed successfully',
    }
  } catch (error) {
    console.error('Failed to decompress file:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to decompress file',
    })
  }
})
