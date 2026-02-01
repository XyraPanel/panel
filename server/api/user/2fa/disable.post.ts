import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import bcrypt from 'bcryptjs'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAccountUser } from '#server/utils/security'
import { twoFactorDisableSchema } from '#shared/schema/account'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAccountUser(event)
  const { password } = await readValidatedBodyWithLimit(event, twoFactorDisableSchema, BODY_SIZE_LIMITS.SMALL)

  const db = useDrizzle()
  const userId = sessionUser.id

  const dbUser = db
    .select({
      password: tables.users.password,
      useTotp: tables.users.useTotp,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!dbUser) {
    throw createError({
      status: 404,
      statusText: 'User not found',
    })
  }

  const isValidPassword = await bcrypt.compare(password, dbUser.password)
  if (!isValidPassword) {
    throw createError({
      status: 401,
      statusText: 'Invalid password',
    })
  }

  if (!dbUser.useTotp) {
    throw createError({
      status: 400,
      statusText: '2FA is not enabled for this account',
    })
  }

  try {
    db.update(tables.users)
      .set({
        useTotp: false,
        totpSecret: null,
        totpAuthenticatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tables.users.id, userId))
      .run()

    db.delete(tables.twoFactor)
      .where(eq(tables.twoFactor.userId, userId))
      .run()

    await recordAuditEventFromRequest(event, {
      actor: sessionUser.email || sessionUser.id,
      actorType: 'user',
      action: 'auth.2fa.disabled',
      targetType: 'user',
      targetId: userId,
    })

    return {
      data: {
        success: true,
        message: '2FA disabled successfully',
      },
    }
  }
  catch (error) {
    console.error('Failed to disable 2FA:', error)
    throw createError({
      status: 500,
      statusText: 'Failed to disable 2FA',
    })
  }
})
