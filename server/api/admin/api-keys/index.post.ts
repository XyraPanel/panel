import { randomUUID } from 'node:crypto'
import { getServerSession, isAdmin, getSessionUser  } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { generateIdentifier, generateApiToken, hashApiToken, formatApiKey } from '~~/server/utils/apiKeys'
import type { CreateApiKeyPayload, CreateApiKeyResponse } from '#shared/types/admin'

export default defineEventHandler(async (event): Promise<CreateApiKeyResponse> => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const user = getSessionUser(session)

  if (!user || !user.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'User not found in session',
    })
  }

  const db = useDrizzle()

  const dbUser = db.select().from(tables.users).where(eq(tables.users.id, user.id)).get()
  if (!dbUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found in database. Please log out and log back in.',
    })
  }

  const body = await readBody<CreateApiKeyPayload>(event)

  const identifier = generateIdentifier()
  const token = generateApiToken()
  const hashedToken = await hashApiToken(token)

  const now = new Date()

  const apiKeyId = randomUUID()

  db.insert(tables.apiKeys).values({
    id: apiKeyId,
    userId: user.id,
    keyType: 1,
    identifier,
    token: hashedToken,
    key: formatApiKey(identifier, token),
    allowedIps: body.allowedIps ? JSON.stringify(body.allowedIps) : null,
    memo: body.memo || null,
    lastUsedAt: null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,

    rServers: body.permissions?.rServers ?? 0,
    rNodes: body.permissions?.rNodes ?? 0,
    rAllocations: body.permissions?.rAllocations ?? 0,
    rUsers: body.permissions?.rUsers ?? 0,
    rLocations: body.permissions?.rLocations ?? 0,
    rNests: body.permissions?.rNests ?? 0,
    rEggs: body.permissions?.rEggs ?? 0,
    rDatabaseHosts: body.permissions?.rDatabaseHosts ?? 0,
    rServerDatabases: body.permissions?.rServerDatabases ?? 0,
    createdAt: now,
    updatedAt: now,
  }).run()

  return {
    id: apiKeyId,
    identifier,
    apiKey: formatApiKey(identifier, token),
    memo: body.memo || null,
    createdAt: now.toISOString(),
  }
})
