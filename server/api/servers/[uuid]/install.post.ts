import { createError } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const uuid = getRouterParam(event, 'uuid')
  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  const body = await readBody(event)
  const { successful } = body

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const now = new Date()

  if (successful) {

    db.update(tables.servers)
      .set({
        status: null,
        installedAt: now,
        updatedAt: now,
      })
      .where(eq(tables.servers.id, server.id))
      .run()
  } else {

    db.update(tables.servers)
      .set({
        status: 'install_failed',
        updatedAt: now,
      })
      .where(eq(tables.servers.id, server.id))
      .run()
  }

  return {
    success: true,
    message: successful ? 'Installation marked as complete' : 'Installation marked as failed',
  }
})
