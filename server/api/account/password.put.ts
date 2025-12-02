import { createError, assertMethod, parseCookies } from 'h3'
import { APIError } from 'better-auth/api'
import { getAuth, normalizeHeadersForAuth } from '~~/server/utils/auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'
import { accountPasswordUpdateSchema } from '#shared/schema/account'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  const auth = getAuth()
  
  const session = await auth.api.getSession({
    headers: normalizeHeadersForAuth(event.node.req.headers),
  })

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, payload => accountPasswordUpdateSchema.parse(payload))

  const { useDrizzle, tables, eq } = await import('~~/server/utils/drizzle')
  const db = useDrizzle()
  
  const userBeforeChange = db
    .select({ passwordCompromised: tables.users.passwordCompromised })
    .from(tables.users)
    .where(eq(tables.users.id, session.user.id))
    .get()
  
  const hadCompromisedPassword = Boolean(userBeforeChange?.passwordCompromised)

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: true,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    })

    await db.update(tables.users)
      .set({
        passwordCompromised: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.users.id, session.user.id))
      .run()

    if (hadCompromisedPassword) {
      const cookies = parseCookies(event)
      const currentToken = cookies['better-auth.session_token'] || session.session?.token
      
      if (currentToken) {
        try {
          await auth.api.revokeSession({
            body: { token: currentToken },
            headers: normalizeHeadersForAuth(event.node.req.headers),
          })
        }
        catch (revokeError) {
          console.warn(`Failed to revoke session for user ${session.user.id}:`, revokeError)
        }
      }

      const auditUser = resolveSessionUser(session)
      if (auditUser) {
        await recordAuditEventFromRequest(event, {
          actor: auditUser.email || auditUser.id,
          actorType: 'user',
          action: 'account.password.update',
          targetType: 'user',
          targetId: auditUser.id,
          metadata: {
            compromisedPasswordCleared: true,
            signedOut: true,
          },
        }).catch(err => console.warn('Audit logging failed:', err))
      }

      return {
        success: true,
        revokedSessions: 0, 
        signedOut: true,
        message: 'Password changed successfully. Please sign in again with your new password.',
      }
    }

    const resolvedUser = resolveSessionUser(session)
    if (resolvedUser) {
      await recordAuditEventFromRequest(event, {
        actor: resolvedUser.email || resolvedUser.id,
        actorType: 'user',
        action: 'account.password.update',
        targetType: 'user',
        targetId: resolvedUser.id,
      }).catch(err => console.warn('Audit logging failed:', err))
    }

    return {
      success: true,
      revokedSessions: 0, 
      signedOut: false,
    }
  }
  catch (error) {
    if (error instanceof APIError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message || 'Failed to change password',
      })
    }
    throw createError({
      statusCode: 400,
      statusMessage: 'Failed to change password',
    })
  }
})
