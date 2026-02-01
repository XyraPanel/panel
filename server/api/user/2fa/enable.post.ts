import { APIError } from 'better-auth/api'
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAccountUser } from '#server/utils/security'
import { twoFactorEnableSchema } from '#shared/schema/account'

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event)
  const auth = getAuth()

  const { password } = await readValidatedBodyWithLimit(event, twoFactorEnableSchema, BODY_SIZE_LIMITS.SMALL)

  try {
    const api = auth.api as typeof auth.api & {
      enableTwoFactor: (options: {
        body: { password: string }
        headers: Record<string, string>
      }) => Promise<{ totpURI?: string; backupCodes?: string[] }>
    }
    const result = await api.enableTwoFactor({
      body: {
        password,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    })

    const secretFromUri = result.totpURI ? result.totpURI.split('secret=')[1]?.split('&')[0] : null
    
    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'auth.2fa.setup.initiated',
      targetType: 'user',
      targetId: user.id,
    })

    return {
      data: {
        uri: result.totpURI,
        secret: secretFromUri || '',
        recoveryTokens: result.backupCodes || [],
        backupCodes: result.backupCodes || [],
      },
    }
  }
  catch (error) {
    if (error instanceof APIError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message || 'Failed to enable 2FA',
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to enable 2FA',
    })
  }
})
