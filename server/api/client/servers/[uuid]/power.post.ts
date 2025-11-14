
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
  const { action } = body

  if (!action || !['start', 'stop', 'restart', 'kill'].includes(action)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid power action. Must be one of: start, stop, restart, kill',
    })
  }

  const { useDrizzle, tables, eq } = await import('../../../../utils/drizzle')
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

  const { requireServerPermission } = await import('../../../../utils/api-helpers')
  await requireServerPermission(event, server.id, 'control.start')

  const { getWingsClientForServer } = await import('../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {

    await client.sendPowerAction(uuid, action as 'start' | 'stop' | 'restart' | 'kill')

    return {
      success: true,
      message: `Server ${action} command sent successfully`,
    }
  } catch (error) {
    console.error('Wings power action failed:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to send power command to server',
    })
  }
})
