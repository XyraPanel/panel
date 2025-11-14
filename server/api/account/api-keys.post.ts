import { randomUUID } from 'node:crypto'
import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { generateIdentifier, generateApiToken, hashApiToken } from '~~/server/utils/apiKeys'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { validateBody } from '~~/server/utils/validation'
import { createApiKeySchema } from '~~/server/schemas/account'

interface ApiKeyResponse {
  data: {
    identifier: string
    description: string | null
    allowed_ips: string[]
    last_used_at: string | null
    created_at: string
  }
  meta: {
    secret_token: string
  }
}

export default defineEventHandler(async (event): Promise<ApiKeyResponse> => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'You must be logged in to create API keys',
    })
  }

  const body = await validateBody(event, createApiKeySchema)

  const db = useDrizzle()
  const existingKeys = db
    .select()
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user.id))
    .all()

  if (existingKeys.length >= 25) {
    throw createError({
      statusCode: 400,
      message: 'You have reached the account limit for number of API keys.',
    })
  }

  const identifier = generateIdentifier()
  const plainToken = generateApiToken()
  const hashedToken = await hashApiToken(plainToken)
  const now = new Date()

  db.insert(tables.apiKeys)
    .values({
      id: randomUUID(),
      userId: user.id,
      keyType: 1,
      identifier,
      token: hashedToken,
      memo: body.memo ?? null,
      allowedIps: body.allowedIps && body.allowedIps.length > 0 ? JSON.stringify(body.allowedIps) : null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const key = db
    .select()
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.identifier, identifier))
    .get()

  const lastUsedAt = key!.lastUsedAt instanceof Date ? key!.lastUsedAt.toISOString() : key!.lastUsedAt ?? null
  const createdAt = key!.createdAt instanceof Date ? key!.createdAt.toISOString() : key!.createdAt
  const allowedIps = key!.allowedIps ? (JSON.parse(key!.allowedIps) as string[]) : []

  return {
    data: {
      identifier: key!.identifier,
      description: key!.memo,
      allowed_ips: allowedIps,
      last_used_at: lastUsedAt,
      created_at: createdAt,
    },
    meta: {
      secret_token: `${identifier}.${plainToken}`,
    },
  }
})
