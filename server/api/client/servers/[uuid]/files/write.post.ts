
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
  const query = getQuery(event)
  const file = query.file as string

  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  if (!file) {
    throw createError({
      statusCode: 400,
      message: 'File path is required',
    })
  }

  const body = await readBody(event)
  const content = typeof body === 'string' ? body : body.content || ''

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
  await requireServerPermission(event, server.id, 'file.update')

  const { getWingsClientForServer } = await import('../../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {
    await client.writeFileContents(uuid, file, content)

    return {
      success: true,
      message: 'File saved successfully',
    }
  } catch (error) {
    console.error('Failed to write file:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to write file',
    })
  }
})
