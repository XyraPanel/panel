import { useDrizzle, tables, eq, and, assertSqliteDatabase } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'
import { requireRouteParam } from '#server/utils/http/params'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE')

  const accountContext = await requireAccountUser(event)
  const user = accountContext.user

  const identifier = await requireRouteParam(event, 'identifier', 'Missing API key identifier')

  const db = useDrizzle()
  assertSqliteDatabase(db)

  const apiKey = db
    .select()
    .from(tables.apiKeys)
    .where(
      and(
        eq(tables.apiKeys.id, identifier),
        eq(tables.apiKeys.userId, user.id)
      )
    )
    .get()

  if (!apiKey) {
    throw createError({
      status: 404,
      statusText: 'Not Found',
      message: 'API key not found',
    })
  }

  db.delete(tables.apiKeys)
    .where(eq(tables.apiKeys.id, apiKey.id))
    .run()

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.api_key.delete',
    targetType: 'user',
    targetId: identifier,
    metadata: {
      identifier,
    },
  })

  return { success: true }
})
