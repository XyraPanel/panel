import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { verifyTotpToken } from '~~/server/utils/totp'
import { getSessionUser } from '~~/server/utils/session'
import { log2FA, getRequestMetadata } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const body = await readBody(event)
  const { token } = body

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    })
  }

  const userId = user.id
  const db = useDrizzle()

  const dbUser = db
    .select({
      totpSecret: tables.users.totpSecret,
      useTotp: tables.users.useTotp,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!dbUser?.totpSecret) {
    throw createError({
      statusCode: 400,
      message: '2FA setup not initiated',
    })
  }

  const isValid = verifyTotpToken(token, dbUser.totpSecret)

  if (!isValid) {
    throw createError({
      statusCode: 400,
      message: 'Invalid token',
    })
  }

  const now = new Date()
  db.update(tables.users)
    .set({
      useTotp: true,
      totpAuthenticatedAt: now,
      updatedAt: now,
    })
    .where(eq(tables.users.id, userId))
    .run()

  log2FA(userId, 'auth.2fa.enabled', getRequestMetadata(event))

  return {
    success: true,
    message: '2FA enabled successfully',
  }
})
