import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { getSessionUser } from '~~/server/utils/session'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'
import bcrypt from 'bcryptjs'

interface UpdateEmailPayload {
  email: string
  password: string
}

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, (payload) => {
    if (!payload || typeof payload !== 'object') {
      throw createError({ statusCode: 400, message: 'Invalid payload' })
    }

    const candidate = payload as UpdateEmailPayload

    if (!candidate.email || !candidate.password) {
      throw createError({ statusCode: 400, message: 'Email and password are required' })
    }

    return candidate
  })

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

  db.update(tables.users)
    .set({
      email: body.email,
      updatedAt: new Date(),
    })
    .where(eq(tables.users.id, user.id))
    .run()

  await recordAuditEventFromRequest(event, {
    actor: user.email ?? user.id ?? 'user',
    actorType: 'user',
    action: 'account.email.update',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      newEmail: body.email,
    },
  })

  return { success: true }
})
