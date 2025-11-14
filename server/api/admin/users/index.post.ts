import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { AdminCreateUserPayload } from '#shared/types/user'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<AdminCreateUserPayload>(event)

  if (!body.username || !body.email || !body.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Username, email, and password are required',
    })
  }

  const db = useDrizzle()
  const now = new Date()

  const hashedPassword = await bcrypt.hash(body.password, 10)

  const newUser = {
    id: randomUUID(),
    username: body.username,
    email: body.email,
    password: hashedPassword,
    nameFirst: body.nameFirst ?? null,
    nameLast: body.nameLast ?? null,
    language: 'en',
    rootAdmin: body.role === 'admin',
    emailVerified: null,
    image: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.users).values(newUser).run()

  return {
    data: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      name: newUser.nameFirst,
      role: newUser.rootAdmin ? 'admin' : 'user',
      createdAt: newUser.createdAt.toISOString(),
    },
  }
})
