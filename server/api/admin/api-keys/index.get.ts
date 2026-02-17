import { requireAdmin } from '#server/utils/security'
import { useDrizzle, tables, assertSqliteDatabase } from '#server/utils/drizzle'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.API_KEYS, ADMIN_ACL_PERMISSIONS.READ)
  const db = useDrizzle()
  assertSqliteDatabase(db)

  const keys = db
    .select({
      id: tables.apiKeys.id,
      identifier: tables.apiKeys.identifier,
      start: tables.apiKeys.start,
      memo: tables.apiKeys.memo,
      name: tables.apiKeys.name,
      lastUsedAt: tables.apiKeys.lastUsedAt,
      expiresAt: tables.apiKeys.expiresAt,
      createdAt: tables.apiKeys.createdAt,
    })
    .from(tables.apiKeys)
    .orderBy(tables.apiKeys.createdAt)
    .all()

  const data = keys.map((key: {
    id: string
    identifier: string | null
    start: string | null
    memo: string | null
    name: string | null
    lastUsedAt: Date | null
    expiresAt: Date | null
    createdAt: Date
  }) => ({
    id: key.id,
    identifier: key.identifier || key.start || key.id,
    memo: key.memo || key.name || null,
    lastUsedAt: key.lastUsedAt?.toISOString() || null,
    expiresAt: key.expiresAt?.toISOString() || null,
    createdAt: key.createdAt.toISOString(),
  }))

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.api_key.listed',
    targetType: 'api_key',
    metadata: {
      count: data.length,
    },
  })

  return {
    data,
  }
})
