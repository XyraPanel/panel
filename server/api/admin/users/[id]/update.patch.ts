import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import bcrypt from 'bcryptjs'
import { getSessionUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const sessionUser = getSessionUser(session)

  if (sessionUser?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'User ID is required',
    })
  }

  const body = await readBody(event)
  const { username, email, password, nameFirst, nameLast, language, rootAdmin } = body

  const db = useDrizzle()

  const existing = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, id))
    .get()

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'User not found',
    })
  }

  const updates: Partial<typeof tables.users.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (username !== undefined) updates.username = username
  if (email !== undefined) updates.email = email
  if (nameFirst !== undefined) updates.nameFirst = nameFirst || null
  if (nameLast !== undefined) updates.nameLast = nameLast || null
  if (language !== undefined) updates.language = language
  if (rootAdmin !== undefined) updates.rootAdmin = rootAdmin === true || rootAdmin === 'true'

  if (password) {
    updates.password = await bcrypt.hash(password, 10)
  }

  db.update(tables.users)
    .set(updates)
    .where(eq(tables.users.id, id))
    .run()

  const user = db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
      language: tables.users.language,
      rootAdmin: tables.users.rootAdmin,
      emailVerified: tables.users.emailVerified,
      image: tables.users.image,
      createdAt: tables.users.createdAt,
      updatedAt: tables.users.updatedAt,
    })
    .from(tables.users)
    .where(eq(tables.users.id, id))
    .get()

  return { user }
})
