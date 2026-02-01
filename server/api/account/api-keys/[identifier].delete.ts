import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE')

  const accountContext = await requireAccountUser(event)
  const user = accountContext.user

  const { identifier } = await getValidatedRouterParams(event, (params) => {
    const identifierParam = (params as Record<string, unknown>).identifier
    if (typeof identifierParam !== 'string' || identifierParam.trim().length === 0) {
      throw createError({ status: 400, statusText: 'Missing API key identifier' })
    }

    return { identifier: identifierParam }
  })

  const db = useDrizzle()

  const apiKey = db
    .select({
      id: tables.apiKeys.id,
      userId: tables.apiKeys.userId,
    })
    .from(tables.apiKeys)
    .where(
      and(
        eq(tables.apiKeys.identifier, identifier),
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

  await db.delete(tables.apiKeys)
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
