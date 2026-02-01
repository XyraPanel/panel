import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const sessionUser = accountContext.user

  const db = useDrizzle()

  const profile = db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      role: tables.users.role,
    })
    .from(tables.users)
    .where(eq(tables.users.id, sessionUser.id))
    .get()

  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  await recordAuditEventFromRequest(event, {
    actor: sessionUser.id,
    actorType: 'user',
    action: 'account.profile.viewed',
    targetType: 'user',
    targetId: sessionUser.id,
  })

  return { data: profile }
})

