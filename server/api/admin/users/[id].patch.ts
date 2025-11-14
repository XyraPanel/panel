import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import bcrypt from 'bcryptjs'
import type { UpdateUserRequest } from '#shared/types/user'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'User ID is required' })
  }

  const body = await readBody<Partial<UpdateUserRequest>>(event)
  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }

  const updates: Partial<typeof tables.users.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (body.username !== undefined) updates.username = body.username
  if (body.email !== undefined) updates.email = body.email
  if (body.nameFirst !== undefined) updates.nameFirst = body.nameFirst
  if (body.nameLast !== undefined) updates.nameLast = body.nameLast
  if (body.rootAdmin !== undefined) updates.rootAdmin = body.rootAdmin

  if (body.password) {
    updates.password = await bcrypt.hash(body.password, 10)
  }

  if (Object.keys(updates).length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No updates provided' })
  }

  await db.update(tables.users).set(updates).where(eq(tables.users.id, userId))

  const updated = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  return {
    data: {
      id: updated!.id,
      username: updated!.username,
      email: updated!.email,
      name: updated!.nameFirst || updated!.nameLast || null,
      role: updated!.rootAdmin ? 'admin' : 'user',
      createdAt: new Date(updated!.createdAt).toISOString(),
    },
  }
})
