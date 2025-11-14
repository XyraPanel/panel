import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import bcrypt from 'bcryptjs'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

import type { UpdatePasswordPayload } from '#shared/types/auth'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, (payload) => {
    if (!payload || typeof payload !== 'object') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
    }

    const candidate = payload as UpdatePasswordPayload

    if (!candidate.currentPassword || !candidate.newPassword) {
      throw createError({ statusCode: 400, statusMessage: 'Current and new password are required' })
    }

    if (candidate.confirmPassword && candidate.confirmPassword !== candidate.newPassword) {
      throw createError({ statusCode: 400, statusMessage: 'Password confirmation does not match' })
    }

    if (candidate.currentPassword === candidate.newPassword) {
      throw createError({ statusCode: 400, statusMessage: 'Choose a password different from the current one' })
    }

    return candidate
  })

  const db = useDrizzle()

  const userRow = db.select({ password: tables.users.password })
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .get()

  if (!userRow || !bcrypt.compareSync(body.currentPassword, userRow.password)) {
    throw createError({ statusCode: 400, statusMessage: 'Current password is incorrect' })
  }

  const hashedPassword = bcrypt.hashSync(body.newPassword, 12)

  db.update(tables.users)
    .set({ password: hashedPassword })
    .where(eq(tables.users.id, user.id))
    .run()

  const revokedSessions = db.delete(tables.sessions)
    .where(eq(tables.sessions.userId, user.id))
    .run()

  const revokedCount = typeof revokedSessions.changes === 'number' ? revokedSessions.changes : 0

  await recordAuditEventFromRequest(event, {
    actor: user.email || user.id,
    actorType: 'user',
    action: 'account.password.update',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      revokedSessions: revokedCount,
    },
  })

  return {
    success: true,
    revokedSessions: revokedCount,
  }
})
