import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import bcrypt from 'bcryptjs'

import { useDrizzle, tables, eq, or } from '~~/server/utils/drizzle'
import { sendWelcomeEmail } from '~~/server/utils/email'
import type { Role } from '#shared/types/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string, email?: string, password?: string, role?: 'admin' | 'user' }>(event)

  const username = body?.username?.trim().toLowerCase()
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password
  const role = body?.role

  if (!username || !email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing fields',
      message: 'Username, email and password are required.',
    })
  }

  const db = useDrizzle()

  try {
    const existingUser = db.select({ id: tables.users.id })
      .from(tables.users)
      .where(
        or(
          eq(tables.users.username, username),
          eq(tables.users.email, email),
        ),
      )
      .limit(1)
      .get()

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'Username or email already exists.',
      })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const id = randomUUID()
    const normalizedRole: Role = role === 'admin' ? 'admin' : 'user'
    const now = new Date()

    await db.insert(tables.users)
      .values({
        id,
        username,
        email,
        password: hashedPassword,
        role: normalizedRole,
        createdAt: now,
        updatedAt: now,
        emailVerified: null,
        image: null,
      })
      .run()

    const createdUser = db.select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      role: tables.users.role,
    })
      .from(tables.users)
      .where(eq(tables.users.id, id))
      .limit(1)
      .get()

    if (createdUser) {
      await sendWelcomeEmail(createdUser.email, createdUser.username)
    }

    return {
      user: createdUser ?? {
        id,
        username,
        email,
        role: normalizedRole,
      },
      message: 'Account created successfully.',
    }
  }
  catch (error) {
    const potentialH3Error = error as { statusCode?: number }
    if (potentialH3Error?.statusCode) {
      throw error
    }

    if (error instanceof Error) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Registration failed',
        message: error.message,
      })
    }

    throw createError({
      statusCode: 400,
      statusMessage: 'Registration failed',
      message: 'Unable to create user.',
    })
  }
})
