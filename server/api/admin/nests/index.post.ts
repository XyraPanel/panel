import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { CreateNestPayload } from '#shared/types/admin-nests'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<CreateNestPayload>(event)

  if (!body.name || !body.author) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Name and author are required' })
  }

  const db = useDrizzle()
  const now = new Date()

  const newNest = {
    id: randomUUID(),
    uuid: randomUUID(),
    author: body.author,
    name: body.name,
    description: body.description || null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.nests).values(newNest)

  return {
    data: {
      id: newNest.id,
      uuid: newNest.uuid,
      author: newNest.author,
      name: newNest.name,
      description: newNest.description,
      createdAt: newNest.createdAt.toISOString(),
      updatedAt: newNest.updatedAt.toISOString(),
    },
  }
})
