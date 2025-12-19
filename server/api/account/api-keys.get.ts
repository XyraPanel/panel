import { createError } from 'h3'
import { getServerSession, getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const user = getSessionUser(session)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDrizzle()

  const keys = db
    .select({
      id: tables.apiKeys.id,
      name: tables.apiKeys.name,
      expiresAt: tables.apiKeys.expiresAt,
      createdAt: tables.apiKeys.createdAt,
    })
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user.id))
    .orderBy(tables.apiKeys.createdAt)
    .all()

  const keyPermissions = db
    .select({
      apiKeyId: tables.apiKeyMetadata.apiKeyId,
      memo: tables.apiKeyMetadata.memo,
      allowedIps: tables.apiKeyMetadata.allowedIps,
      lastUsedAt: tables.apiKeyMetadata.lastUsedAt,
    })
    .from(tables.apiKeyMetadata)
    .all()

  const permsByKeyId = new Map(keyPermissions.map(p => [p.apiKeyId, p]))

  return {
    data: keys.map(key => {
      const perms = permsByKeyId.get(key.id)

      let allowedIps: string[] = []
      if (perms?.allowedIps) {
        if (typeof perms.allowedIps === 'string') {
          try {
            const parsed = JSON.parse(perms.allowedIps)
            allowedIps = Array.isArray(parsed) ? parsed : []
          } catch {
            allowedIps = perms.allowedIps.split(',').map((ip: string) => ip.trim()).filter(Boolean)
          }
        } else if (Array.isArray(perms.allowedIps)) {
          allowedIps = perms.allowedIps
        }
      }

      return {
        identifier: key.id,
        description: perms?.memo || key.name || null,
        allowed_ips: allowedIps,
        last_used_at: perms?.lastUsedAt?.toISOString() || null,
        created_at: key.createdAt.toISOString(),
      }
    }),
  }
})
