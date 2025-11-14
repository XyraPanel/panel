import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, or } from '~~/server/utils/drizzle'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getSessionUser } from '~~/server/utils/session'
import { logUserEvent, getRequestMetadata } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const sessionUser = getSessionUser(session)

  if (sessionUser?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const body = await readBody(event)
  const { username, email, password, nameFirst, nameLast, language, rootAdmin } = body

  if (!username || !email) {
    throw createError({
      statusCode: 400,
      message: 'Username and email are required',
    })
  }

  const db = useDrizzle()

  const existing = db
    .select()
    .from(tables.users)
    .where(or(eq(tables.users.username, username), eq(tables.users.email, email)))
    .get()

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'User with this username or email already exists',
    })
  }

  const finalPassword = password || randomUUID()
  const hashedPassword = await bcrypt.hash(finalPassword, 10)

  const now = new Date()
  const userId = randomUUID()

  db.insert(tables.users).values({
    id: userId,
    username,
    email,
    password: hashedPassword,
    nameFirst: nameFirst || null,
    nameLast: nameLast || null,
    language: language || 'en',
    rootAdmin: rootAdmin === true || rootAdmin === 'true',
    emailVerified: null,
    image: null,
    createdAt: now,
    updatedAt: now,
  }).run()

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
    .where(eq(tables.users.id, userId))
    .get()

  logUserEvent(sessionUser.id, 'user.created', userId, {
    ...getRequestMetadata(event),
    username,
    email,
    rootAdmin: rootAdmin === true || rootAdmin === 'true',
  })

  return {
    user,
    generatedPassword: password ? undefined : finalPassword,
  }
})
