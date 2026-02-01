import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { requireAdmin } from '#server/utils/security'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'User ID is required' })
  }

  if (userId === session.user.id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Cannot impersonate yourself' })
  }

  const db = useDrizzle()
  const user = db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      suspended: tables.users.suspended,
      banned: tables.users.banned,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }

  if (user.suspended || user.banned) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Cannot impersonate a suspended or banned user' })
  }

  try {
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    const now = new Date()
    const tokenId = randomUUID()

    await db.run(sql`
      INSERT INTO user_impersonation_tokens (id, user_id, issued_by, token_hash, expires_at, created_at)
      VALUES (${tokenId}, ${userId}, ${session.user.id}, ${tokenHash}, ${expiresAt.getTime()}, ${now.getTime()})
    `)

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.impersonate',
      targetType: 'user',
      targetId: userId,
      metadata: {
        username: user.username,
        impersonationTokenId: tokenId,
        expiresAt: expiresAt.toISOString(),
      },
    })

    const runtimeConfig = useRuntimeConfig()
    const requestUrl = getRequestURL(event)
    const baseUrl = runtimeConfig.public?.panelBaseUrl || requestUrl.origin

    return {
      data: {
        success: true,
        impersonateUrl: `${baseUrl}/auth/impersonate?token=${token}`,
        expiresAt: expiresAt.toISOString(),
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to impersonate user'
    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }
})
