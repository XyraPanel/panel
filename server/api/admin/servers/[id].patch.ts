import { createError, assertMethod, getRequestIP, getRequestHost, readRawBody, type H3Event } from 'h3'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import type { UpdateAdminServerPayload } from '#shared/types/admin-servers'
import { requireRouteParam } from '~~/server/utils/http/params'

const MAX_BODY_SIZE = 16 * 1024

function validateUpdatePayload(payload: unknown): payload is UpdateAdminServerPayload {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const allowedKeys = ['name', 'description', 'ownerId', 'externalId']
  const entries = Object.entries(payload as Record<string, unknown>)

  if (entries.length === 0) {
    return false
  }

  return entries.every(([key, value]) => {
    if (!allowedKeys.includes(key)) {
      return false
    }

    if (value === undefined) {
      return true
    }

    if (key === 'ownerId' || key === 'externalId' || key === 'name') {
      return typeof value === 'string' && value.trim().length > 0
    }

    if (key === 'description') {
      return typeof value === 'string'
    }

    return false
  })
}

async function readUpdatePayload(event: H3Event): Promise<UpdateAdminServerPayload> {
  const raw = await readRawBody(event, 'utf8')

  if (raw && raw.length > MAX_BODY_SIZE) {
    throw createError({ statusCode: 413, message: 'Payload too large' })
  }

  let parsed: unknown
  try {
    parsed = raw && raw.length > 0 ? JSON.parse(raw) : {}
  } catch (error) {
    throw createError({ statusCode: 400, message: 'Invalid JSON body', cause: error })
  }

  if (!validateUpdatePayload(parsed)) {
    throw createError({ statusCode: 400, message: 'Invalid update payload' })
  }

  return parsed
}

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PATCH')

  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const serverId = await requireRouteParam(event, 'id', 'Server ID required')

  const body = await readUpdatePayload(event)

  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, message: 'Server not found' })
  }

  const updates: UpdateAdminServerPayload & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (body.name) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.ownerId) updates.ownerId = body.ownerId
  if (body.externalId !== undefined) updates.externalId = body.externalId

  db.update(tables.servers)
    .set(updates)
    .where(eq(tables.servers.id, serverId))
    .run()

  const updated = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  console.info('[admin][servers:update]', {
    serverId,
    actor: session?.user?.email,
    ip: getRequestIP(event),
    host: getRequestHost(event, { xForwardedHost: true }),
  })

  return {
    data: updated,
  }
})
