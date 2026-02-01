import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const user = accountContext.user

  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing SSH key ID' })
  }

  const db = useDrizzle()

  const key = db
    .select()
    .from(tables.sshKeys)
    .where(and(
      eq(tables.sshKeys.id, id),
      eq(tables.sshKeys.userId, user.id),
    ))
    .get()

  if (!key) {
    throw createError({ statusCode: 404, statusMessage: 'SSH key not found' })
  }

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.ssh_key.delete',
    targetType: 'user',
    targetId: id,
    metadata: {
      name: key.name,
      fingerprint: key.fingerprint,
    },
  })

  db.delete(tables.sshKeys)
    .where(eq(tables.sshKeys.id, id))
    .run()

  return {
    success: true,
    message: 'SSH key deleted successfully',
  }
})
