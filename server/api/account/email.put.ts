import bcrypt from 'bcryptjs'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import type { UpdateEmailResponse } from '#shared/types/account'
import { updateEmailSchema } from '#shared/schema/account'
import { requireAccountUser, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'

export default defineEventHandler(async (event): Promise<UpdateEmailResponse> => {
  assertMethod(event, 'PUT')

  const { user } = await requireAccountUser(event)

  const body = await readValidatedBodyWithLimit(
    event,
    updateEmailSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const db = useDrizzle()
  const userRow = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .get()

  if (!userRow) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const valid = await bcrypt.compare(body.password, userRow.password)

  if (!valid) {
    throw createError({ statusCode: 400, message: 'Invalid password' })
  }

  const existing = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.email))
    .get()

  if (existing && existing.id !== user.id) {
    throw createError({ statusCode: 400, message: 'Email already in use' })
  }
  const oldEmail = userRow.email

  db.update(tables.users)
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

  return { success: true }
})
