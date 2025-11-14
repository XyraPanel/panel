import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { generateTotpSecret, generateTotpUri, generateRecoveryTokens, hashRecoveryToken } from '~~/server/utils/totp'
import { randomUUID } from 'node:crypto'
import { getSessionUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const userId = user.id
  const username = user.username

  const db = useDrizzle()

  const existingUser = db
    .select({ useTotp: tables.users.useTotp })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (existingUser?.useTotp) {
    throw createError({
      statusCode: 400,
      message: '2FA is already enabled',
    })
  }

  const secret = generateTotpSecret()
  const uri = generateTotpUri(secret, username)

  const recoveryTokens = generateRecoveryTokens(8)

  const now = new Date()
  for (const token of recoveryTokens) {
    const hashedToken = await hashRecoveryToken(token)
    db.insert(tables.recoveryTokens).values({
      id: randomUUID(),
      userId,
      token: hashedToken,
      usedAt: null,
      createdAt: now,
    }).run()
  }

  db.update(tables.users)
    .set({
      totpSecret: secret,
      updatedAt: now,
    })
    .where(eq(tables.users.id, userId))
    .run()

  return {
    secret,
    uri,
    recoveryTokens,
  }
})
