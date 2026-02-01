import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAccountUser } from '#server/utils/security'
import { accountProfileUpdateSchema } from '#shared/schema/account'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  const accountContext = await requireAccountUser(event)
  const user = accountContext.user

  const body = await readValidatedBodyWithLimit(
    event,
    accountProfileUpdateSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const db = useDrizzle()

  const currentUser = db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      role: tables.users.role,
    })
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .get()

  if (!currentUser) {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  const oldUsername = currentUser.username
  const oldEmail = currentUser.email

  try {
    if (body.username !== undefined && body.username !== oldUsername) {
      const existingUser = db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(eq(tables.users.username, body.username))
        .get()

      if (existingUser && existingUser.id !== user.id) {
        throw createError({
          status: 409,
          statusText: 'Conflict',
          message: 'Username already in use',
        })
      }

      await db.update(tables.users)
        .set({
          username: body.username,
          updatedAt: new Date(),
        })
        .where(eq(tables.users.id, user.id))
        .run()

      await recordAuditEventFromRequest(event, {
        actor: user.id,
        actorType: 'user',
        action: 'account.username.update',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          oldUsername: oldUsername || null,
          newUsername: body.username,
        },
      })
    }

    if (body.email !== undefined && body.email !== oldEmail) {
      const existingUser = db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(eq(tables.users.email, body.email))
        .get()

      if (existingUser && existingUser.id !== user.id) {
        throw createError({
          status: 409,
          statusText: 'Conflict',
          message: 'Email already in use',
        })
      }

      await db.update(tables.users)
        .set({
          email: body.email,
          emailVerified: null, 
          updatedAt: new Date(),
        })
        .where(eq(tables.users.id, user.id))
        .run()

      await recordAuditEventFromRequest(event, {
        actor: user.id,
        actorType: 'user',
        action: 'account.email.update',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          oldEmail: oldEmail || null,
          newEmail: body.email,
        },
      })
    }

    const updatedUser = db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        role: tables.users.role,
      })
      .from(tables.users)
      .where(eq(tables.users.id, user.id))
      .get()

    if (!updatedUser) {
      throw createError({ status: 404, statusText: 'User not found after update' })
    }

    return {
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role || 'user',
      },
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      throw error
    }
    const message = error instanceof Error ? error.message : 'Unable to update profile'
    throw createError({
      status: 400,
      statusText: message,
    })
  }
})
