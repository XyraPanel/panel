import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const body = await readBody(event)
  const { docker_image } = body

  if (!docker_image) {
    throw createError({
      statusCode: 400,
      message: 'Docker image is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const [egg] = db.select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, server.eggId!))
    .limit(1)
    .all()

  if (!egg) {
    throw createError({
      statusCode: 404,
      message: 'Egg not found',
    })
  }

  db.update(tables.servers)
    .set({
      image: docker_image,
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, server.id))
    .run()

  return {
    object: 'server',
    attributes: {
      docker_image,
    },
  }
})
