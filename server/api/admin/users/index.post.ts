import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { useDrizzle, tables, eq, assertSqliteDatabase } from '#server/utils/drizzle'
import { APIError } from 'better-auth/api'
import { sendAdminUserCreatedEmail } from '#server/utils/email'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { auth, normalizeHeadersForAuth } from '#server/utils/auth'
import { z } from 'zod'

const adminCreateUserSchema = z.object({
  username: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  nameFirst: z.string().trim().optional(),
  nameLast: z.string().trim().optional(),
  language: z.string().trim().optional(),
  role: z.enum(['user', 'admin']),
})

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE)

  const body = await readValidatedBodyWithLimit(
    event,
    adminCreateUserSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const db = useDrizzle()
  assertSqliteDatabase(db)
  const now = new Date()
  const defaultLanguage = process.env.DEFAULT_LANGUAGE || 'en'
  const fullName = [body.nameFirst, body.nameLast].filter(Boolean).join(' ') || body.username

  try {
    const created = await auth.api.createUser({
      body: {
        email: body.email,
        password: body.password,
        name: fullName,
        role: body.role,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    })

    const newUser = {
      id: created.user.id,
      username: body.username,
      email: body.email,
      nameFirst: body.nameFirst ?? null,
      nameLast: body.nameLast ?? null,
      language: body.language || defaultLanguage,
      rootAdmin: body.role === 'admin',
      createdAt: now,
      updatedAt: now,
    }

    db.update(tables.users)
      .set({
        username: newUser.username,
        nameFirst: newUser.nameFirst,
        nameLast: newUser.nameLast,
        language: newUser.language,
        rootAdmin: newUser.rootAdmin,
        role: body.role,
        updatedAt: now,
      })
      .where(eq(tables.users.id, newUser.id))
      .run()

    try {
      await sendAdminUserCreatedEmail({
        to: newUser.email,
        username: newUser.username,
      })
    }
    catch (error) {
      console.error('Failed to send admin user created email', error)
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.created',
      targetType: 'user',
      targetId: newUser.id,
      metadata: {
        email: newUser.email,
        username: newUser.username,
        role: newUser.rootAdmin ? 'admin' : 'user',
      },
    })

    const displayName = newUser.nameFirst && newUser.nameLast
      ? `${newUser.nameFirst} ${newUser.nameLast}`
      : newUser.nameFirst || newUser.nameLast || null

    return {
      data: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        name: displayName,
        role: newUser.rootAdmin ? 'admin' : 'user',
        createdAt: newUser.createdAt.toISOString(),
      },
    }
  }
  catch (error) {
    if (error instanceof APIError) {
      const statusCode = typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to create user',
      })
    }
    throw error
  }
})
