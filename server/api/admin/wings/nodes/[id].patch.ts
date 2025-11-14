import type { H3Event } from 'h3'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { updateWingsNode } from '~~/server/utils/wings/nodesStore'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

interface UpdateNodePayload {
  name?: string
  description?: string
  fqdn?: string
  scheme?: string
  public?: boolean
  maintenanceMode?: boolean
  behindProxy?: boolean
  memory?: number
  memoryOverallocate?: number
  disk?: number
  diskOverallocate?: number
  uploadSize?: number
  daemonListen?: number
  daemonSftp?: number
  daemonBase?: string
}

const MAX_BODY_SIZE = 32 * 1024

function validatePayload(payload: unknown): payload is UpdateNodePayload {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const allowedKeys = new Set<keyof UpdateNodePayload>([
    'name',
    'description',
    'fqdn',
    'scheme',
    'public',
    'maintenanceMode',
    'behindProxy',
    'memory',
    'memoryOverallocate',
    'disk',
    'diskOverallocate',
    'uploadSize',
    'daemonListen',
    'daemonSftp',
    'daemonBase',
  ])

  const entries = Object.entries(payload as Record<string, unknown>)
  if (entries.length === 0) {
    return false
  }

  return entries.every(([key, value]) => allowedKeys.has(key as keyof UpdateNodePayload) && value !== undefined)
}

async function readUpdatePayload(event: H3Event): Promise<UpdateNodePayload> {
  const raw = await readRawBody(event, 'utf8')

  if (raw && raw.length > MAX_BODY_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'Payload too large' })
  }

  let parsed: unknown
  try {
    parsed = raw && raw.length > 0 ? JSON.parse(raw) : {}
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body', cause: error })
  }

  if (!validatePayload(parsed)) {
    throw createError({ statusCode: 400, statusMessage: 'Provide at least one property to update' })
  }

  return parsed
}

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PATCH')

  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const body = await readUpdatePayload(event)

  try {
    const updatedNode = updateWingsNode(id, body)

    console.info('[admin][wings:nodes:update]', {
      nodeId: id,
      actor: session?.user?.email,
      ip: getRequestIP(event),
      host: getRequestHost(event, { xForwardedHost: true }),
      protocol: getRequestProtocol(event, { xForwardedProto: true }),
      url: getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }),
    })

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.email ?? 'admin',
      actorType: 'user',
      action: 'admin:node.update',
      targetType: 'node',
      targetId: id,
    })

    return { data: updatedNode }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update node'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
