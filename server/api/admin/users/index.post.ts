import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { useDrizzle, tables } from '#server/utils/drizzle'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { sendAdminUserCreatedEmail } from '#server/utils/email'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { recordAuditEventFromRequest } from '#server/utils/audit'
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
  const now = new Date()

  const hashedPassword = await bcrypt.hash(body.password, 12)

  const defaultLanguage = process.env.DEFAULT_LANGUAGE || 'en'

  const newUser = {
    id: randomUUID(),
    username: body.username,
    email: body.email,
    password: hashedPassword,
    nameFirst: body.nameFirst ?? null,
    nameLast: body.nameLast ?? null,
    language: body.language || defaultLanguage,
    rootAdmin: body.role === 'admin',
    emailVerified: null,
    image: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.users).values(newUser).run()

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

  const fullName = newUser.nameFirst && newUser.nameLast
    ? `${newUser.nameFirst} ${newUser.nameLast}`
    : newUser.nameFirst || newUser.nameLast || null

  return {
    data: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      name: fullName,
      role: newUser.rootAdmin ? 'admin' : 'user',
      createdAt: newUser.createdAt.toISOString(),
    },
  }
})
