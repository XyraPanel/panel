import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { emailVerificationActionSchema } from '~~/shared/schema/admin/users'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE)
  const auth = getAuth()

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'User ID is required' })
  }

  const body = await readValidatedBodyWithLimit(
    event,
    emailVerificationActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const db = useDrizzle()

  const user = db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      username: tables.users.username,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }

  try {
    switch (body.action) {
      case 'mark-verified': {
        const now = new Date()
        await db.update(tables.users)
          .set({
            emailVerified: now,
            updatedAt: now,
          })
          .where(eq(tables.users.id, userId))
          .run()
        break
      }
      case 'mark-unverified': {
        await db.update(tables.users)
          .set({
            emailVerified: null,
            updatedAt: new Date(),
          })
          .where(eq(tables.users.id, userId))
          .run()
        break
      }
      case 'resend-link': {
        if (!user.email) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'User is missing an email address' })
        }

        try {
          if (typeof auth.api.sendVerificationEmail === 'function') {
            await auth.api.sendVerificationEmail({
              body: {
                email: user.email,
              },
              headers: normalizeHeadersForAuth(event.node.req.headers),
            })
          } else {
            const { sendEmailVerificationEmail } = await import('#server/utils/email')
            const { createEmailVerificationToken } = await import('#server/utils/email-verification')
            
            const { token, expiresAt } = await createEmailVerificationToken(user.id)
            await sendEmailVerificationEmail({
              to: user.email,
              token,
              expiresAt,
              username: user.username || undefined,
            })
          }
        } catch {
          const { sendEmailVerificationEmail } = await import('#server/utils/email')
          const { createEmailVerificationToken } = await import('#server/utils/email-verification')
          
          const { token, expiresAt } = await createEmailVerificationToken(user.id)
          await sendEmailVerificationEmail({
            to: user.email,
            token,
            expiresAt,
            username: user.username || undefined,
          })
        }
        break
      }
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: `admin.user.email.${body.action}`,
      targetType: 'user',
      targetId: userId,
      metadata: {
        action: body.action,
        userEmail: user.email ?? undefined,
      },
    })

    return {
      data: {
        success: true,
        action: body.action,
      },
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to perform email verification action'
    let statusCode = 500
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const code = error.statusCode
      if (typeof code === 'number') {
        statusCode = code
      }
    }
    
    throw createError({
      statusCode,
      statusMessage: message,
    })
  }
})
