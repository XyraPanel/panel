
export default defineEventHandler(async (event) => {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const { useDrizzle, tables, eq } = await import('../../../../utils/drizzle')
  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, id))
    .get()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const { requireAdmin } = await import('../../../../utils/api-helpers')
  await requireAdmin(event)

  const { getWingsClientForServer } = await import('../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(server.uuid)

  try {

    await client.updateServer(server.uuid, {})

    return {
      success: true,
      message: 'Server sync triggered successfully',
    }
  } catch (error) {
    console.error('Failed to sync server:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to sync server',
    })
  }
})
