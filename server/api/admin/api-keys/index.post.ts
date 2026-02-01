import { randomUUID } from 'node:crypto'
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { generateIdentifier, generateApiToken, formatApiKey } from '#server/utils/apiKeys'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import type { CreateApiKeyResponse } from '#shared/types/admin'
import { createAdminApiKeySchema } from '#shared/schema/admin/api-keys'
import type { AdminApiKeyPermissionAction } from '#shared/schema/admin/api-keys'
type PermissionAction = AdminApiKeyPermissionAction

export default defineEventHandler(async (event): Promise<{ data: CreateApiKeyResponse }> => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.API_KEYS, ADMIN_ACL_PERMISSIONS.WRITE)

  const user = session.user

  if (!user || !user.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'User not found in session',
    })
  }

  const db = useDrizzle()

  const dbUser = await db.select().from(tables.users).where(eq(tables.users.id, user.id)).get()
  if (!dbUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found in database. Please log out and log back in.',
    })
  }

  const body = await readValidatedBodyWithLimit(event, createAdminApiKeySchema, BODY_SIZE_LIMITS.SMALL)
  const trimmedMemo = body.memo?.trim() || null
  const permissions = body.permissions ?? {}

  const identifier = generateIdentifier()
  const token = generateApiToken()

  const now = new Date()

  const apiKeyId = randomUUID()

  const formattedKey = formatApiKey(identifier, token)

  await db.insert(tables.apiKeys).values({
    id: apiKeyId,
    userId: user.id,
    name: trimmedMemo || 'API Key',
    start: formattedKey.slice(0, 6),
    prefix: 'sk',
    key: formattedKey,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    enabled: true,
    rateLimitEnabled: true,
    requestCount: 0,
    createdAt: now,
    updatedAt: now,
  }).run()

  await db.insert(tables.apiKeyMetadata).values({
    id: randomUUID(),
    apiKeyId: apiKeyId,
    keyType: 1,
    allowedIps: body.allowedIps ? JSON.stringify(body.allowedIps) : null,
    memo: trimmedMemo,
    createdAt: now,
    updatedAt: now,
  }).run()

  const permissionValues = Object.values(permissions) as PermissionAction[][]
  const hasAnyPermissions = permissionValues.some(actions => Array.isArray(actions) && actions.length > 0)

  if (hasAnyPermissions) {
    await db.update(tables.apiKeys)
      .set({
        metadata: JSON.stringify(permissions),
      })
      .where(eq(tables.apiKeys.id, apiKeyId))
      .run()
  }

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'admin.api_key.create',
    targetType: 'api_key',
    targetId: apiKeyId,
    metadata: {
      identifier,
      memo: trimmedMemo,
      allowedIpsCount: body.allowedIps?.length || 0,
      permissions,
    },
  })

  return {
    data: {
      id: apiKeyId,
      identifier,
      apiKey: formattedKey,
      memo: trimmedMemo,
      createdAt: now.toISOString(),
    },
  }
})
