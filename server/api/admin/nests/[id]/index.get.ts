import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const nestId = getRouterParam(event, 'id')
  if (!nestId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Nest ID is required' })
  }

  const db = useDrizzle()

  const nest = await db
    .select()
    .from(tables.nests)
    .where(eq(tables.nests.id, nestId))
    .get()

  if (!nest) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Nest not found' })
  }

  const eggs = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.nestId, nestId))
    .orderBy(tables.eggs.name)
    .all()

  return {
    data: {
      nest: {
        id: nest.id,
        uuid: nest.uuid,
        author: nest.author,
        name: nest.name,
        description: nest.description,
        createdAt: new Date(nest.createdAt).toISOString(),
        updatedAt: new Date(nest.updatedAt).toISOString(),
      },
      eggs: eggs.map(egg => ({
        id: egg.id,
        uuid: egg.uuid,
        nestId: egg.nestId,
        author: egg.author,
        name: egg.name,
        description: egg.description,
        dockerImage: egg.dockerImage,
        createdAt: new Date(egg.createdAt).toISOString(),
        updatedAt: new Date(egg.updatedAt).toISOString(),
      })),
    },
  }
})
