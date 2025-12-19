import { createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { getServerSession } from '~~/server/utils/session'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '~~/server/utils/security'
import { createApiKeySchema } from '#shared/schema/account'
import type { ApiKeyResponse } from '#shared/types/api'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

export default defineEventHandler(async (event): Promise<ApiKeyResponse> => {
  const session = await getServerSession(event)

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'You must be logged in to create API keys',
    })
  }

  const body = await readValidatedBodyWithLimit(
    event,
    createApiKeySchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  try {
    const db = useDrizzle()
    const now = new Date()
    const apiKeyId = randomUUID()
    const apiKeyPermId = randomUUID()

    const rawKey = `sk_${randomUUID()}`

    await db.insert(tables.apiKeys)
      .values({
        id: apiKeyId,
        userId: session.user.id,
        name: body.memo || 'API Key',
        key: rawKey,
        start: rawKey.slice(0, 6),
        prefix: 'sk',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdAt: now,
        updatedAt: now,
        enabled: true,
        rateLimitEnabled: true,
        requestCount: 0,
      })
      .run()

    await db.insert(tables.apiKeyMetadata)
      .values({
        id: apiKeyPermId,
        apiKeyId: apiKeyId,
        keyType: 1,
        allowedIps: body.allowedIps ? JSON.stringify(body.allowedIps) : null,
        memo: body.memo || null,
        lastUsedAt: null,
        rServers: 0,
        rNodes: 0,
        rAllocations: 0,
        rUsers: 0,
        rLocations: 0,
        rNests: 0,
        rEggs: 0,
        rDatabaseHosts: 0,
        rServerDatabases: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await recordAuditEventFromRequest(event, {
      actor: session.user.id,
      actorType: 'user',
      action: 'account.api_key.create',
      targetType: 'user',
      targetId: apiKeyId,
      metadata: {
        description: body.memo || null,
        allowedIpsCount: body.allowedIps?.length || 0,
      },
    })

    return {
      data: {
        identifier: apiKeyId,
        description: body.memo || null,
        allowed_ips: body.allowedIps || [],
        last_used_at: null,
        created_at: now.toISOString(),
      },
      meta: {
        secret_token: rawKey,
      },
    }
  } catch (error) {
    console.error('Error creating API key:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to create API key',
    })
  }
})
