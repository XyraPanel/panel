import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { useDrizzle, tables, eq, or } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { createUserSchema } from '~~/shared/schema/admin/users'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  const body = await readValidatedBodyWithLimit(event, createUserSchema, BODY_SIZE_LIMITS.SMALL)
  const { username, email, password, nameFirst, nameLast, language, rootAdmin, role } = body

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Email is required',
    })
  }

  if (!username) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Username is required',
    })
  }

  const finalPassword = password || randomUUID()
  const db = useDrizzle()

  const existingUser = db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(
      or(
        eq(tables.users.username, username),
        eq(tables.users.email, email),
      )
    )
    .get()

  if (existingUser) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Username or email already exists',
    })
  }

  try {
    const hashedPassword = await bcrypt.hash(finalPassword, 12)
    const userId = randomUUID()
    const now = new Date()
    const normalizedRole = role || (rootAdmin === true || rootAdmin === 'true' ? 'admin' : 'user')

    await db.insert(tables.users)
      .values({
        id: userId,
        username,
        email,
        password: hashedPassword,
        nameFirst: nameFirst || null,
        nameLast: nameLast || null,
        language: language || 'en',
        rootAdmin: rootAdmin === true || rootAdmin === 'true',
        role: normalizedRole,
        emailVerified: null,
        image: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const newUser = db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        role: tables.users.role,
      })
      .from(tables.users)
      .where(eq(tables.users.id, userId))
      .get()

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.created',
      targetType: 'user',
      targetId: userId,
      metadata: {
        username,
        email,
        rootAdmin: rootAdmin === true || rootAdmin === 'true',
      },
    })

    return {
      data: {
        user: newUser || {
          id: userId,
          username,
          email,
          role: normalizedRole,
        },
        generatedPassword: password ? undefined : finalPassword,
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user'
    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }
})
