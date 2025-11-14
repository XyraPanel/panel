import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import bcrypt from 'bcryptjs'
import { getSessionUser } from '~~/server/utils/session'
import { log2FA, getRequestMetadata } from '~~/server/utils/activity'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const sessionUser = getSessionUser(session)

  if (!sessionUser) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const body = await readBody(event)
  const { password } = body

  if (!password) {
    throw createError({
      statusCode: 400,
      message: 'Password is required to disable 2FA',
    })
  }

  const userId = sessionUser.id
  const db = useDrizzle()

  const user = db
    .select({
      password: tables.users.password,
      useTotp: tables.users.useTotp,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found',
    })
  }

  if (!user.useTotp) {
    throw createError({
      statusCode: 400,
      message: '2FA is not enabled',
    })
  }

  const isValidPassword = await bcrypt.compare(password, user.password)
  if (!isValidPassword) {
    throw createError({
      statusCode: 401,
      message: 'Invalid password',
    })
  }

  const now = new Date()
  db.update(tables.users)
    .set({
      useTotp: false,
      totpSecret: null,
      totpAuthenticatedAt: null,
      updatedAt: now,
    })
    .where(eq(tables.users.id, userId))
    .run()

  db.delete(tables.recoveryTokens)
    .where(eq(tables.recoveryTokens.userId, userId))
    .run()

  log2FA(userId, 'auth.2fa.disabled', getRequestMetadata(event))

  return {
    success: true,
    message: '2FA disabled successfully',
  }
})
