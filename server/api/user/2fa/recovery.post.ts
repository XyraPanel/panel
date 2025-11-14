import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { verifyRecoveryToken } from '~~/server/utils/totp'
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
      message: 'Recovery token is required',
    })
  }

  const userId = user.id
  const db = useDrizzle()

  const recoveryTokens = db
    .select()
    .from(tables.recoveryTokens)
    .where(eq(tables.recoveryTokens.userId, userId))
    .all()

  let matchedTokenId: string | null = null

  for (const rt of recoveryTokens) {
    if (rt.usedAt) continue

    const isValid = await verifyRecoveryToken(token, rt.token)
    if (isValid) {
      matchedTokenId = rt.id
      break
    }
  }

  if (!matchedTokenId) {
    throw createError({
      statusCode: 400,
      message: 'Invalid recovery token',
    })
  }

  const now = new Date()
  db.update(tables.recoveryTokens)
    .set({ usedAt: now })
    .where(eq(tables.recoveryTokens.id, matchedTokenId))
    .run()

  db.update(tables.users)
    .set({
      totpAuthenticatedAt: now,
      updatedAt: now,
    })
    .where(eq(tables.users.id, userId))
    .run()

  log2FA(userId, 'auth.recovery.used', {
    ...getRequestMetadata(event),
    tokenId: matchedTokenId,
  })

  return {
    success: true,
    message: 'Recovery token validated successfully',
  }
})
