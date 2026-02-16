import { APIError } from 'better-auth/api'
import type { H3EventContext } from 'h3'
import type { AuthContext } from '#shared/types/auth'
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth'
import { resolveSessionUser } from '#server/utils/auth/sessionUser'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { accountPasswordUpdateSchema } from '#shared/schema/account'
import { requireAuth, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'

function hasAuthContext(ctx: H3EventContext): ctx is H3EventContext & { auth?: AuthContext } {
  return 'auth' in ctx
}

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  const auth = getAuth()
  const middlewareAuth = hasAuthContext(event.context) ? event.context.auth : undefined
  const session = middlewareAuth?.session ?? await requireAuth(event)

  if (!session?.user?.id) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const body = await readValidatedBodyWithLimit(event, accountPasswordUpdateSchema, BODY_SIZE_LIMITS.SMALL)

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: true,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    })

    const resolvedUser = resolveSessionUser(session)
    if (resolvedUser) {
      await recordAuditEventFromRequest(event, {
        actor: resolvedUser.email || resolvedUser.id,
        actorType: 'user',
        action: 'account.password.update',
        targetType: 'user',
        targetId: resolvedUser.id,
      })
    }

    let signedOut = false
    const cookies = parseCookies(event)
    const currentToken = cookies['better-auth.session_token']

    if (currentToken) {
      await auth.api.revokeSession({
        body: { token: currentToken },
        headers: normalizeHeadersForAuth(event.node.req.headers),
      })
      signedOut = true
    }

    return {
      data: {
        success: true,
        revokedSessions: signedOut ? 1 : 0,
        signedOut,
      },
    }
  }
  catch (error) {
    if (error instanceof APIError) {
      throw createError({
        status: Number(error.status) || 400,
        statusText: error.message || 'Failed to change password',
      })
    }
    throw createError({
      status: 400,
      statusText: 'Failed to change password',
    })
  }
})
