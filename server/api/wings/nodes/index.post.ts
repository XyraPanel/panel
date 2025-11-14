import { createError, readBody, type H3Event } from 'h3'
import { createWingsNode, toWingsNodeSummary } from '~~/server/utils/wings/nodesStore'
import { recordAuditEvent } from '~~/server/utils/audit'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

import type { ActorType, TargetType } from '#shared/types/audit'
import type { CreateWingsNodeInput } from '#shared/types/wings'

export default defineEventHandler(async (event: H3Event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  const body = await readBody<CreateWingsNodeInput>(event)
  if (!body?.name || !body?.baseURL) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: name, baseURL' })
  }

  try {
    const node = createWingsNode(body)

    await recordAuditEvent({
      actor: user?.username ?? user?.email ?? 'system',
      actorType: (user?.role ?? 'system') as ActorType,
      action: 'admin:node.create',
      targetType: 'node' satisfies TargetType,
      targetId: node.id,
      metadata: {
        name: node.name,
        fqdn: node.fqdn,
        baseUrl: node.baseURL,
      },
    })

    return { data: toWingsNodeSummary(node) }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create node'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
