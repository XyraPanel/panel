import type { H3Event } from 'h3'
import { findWingsNode, updateWingsNode, toWingsNodeSummary } from '~~/server/utils/wings/nodesStore'
import type { UpdateWingsNodeInput } from '#shared/types/wings'

export default defineEventHandler(async (event: H3Event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const existing = findWingsNode(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  }

  assertMethod(event, 'PATCH')
  const body = await readValidatedBody(event, (payload) => {
    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Provide at least one property to update' })
    }
    return payload as UpdateWingsNodeInput
  })

  try {
    const node = updateWingsNode(id, body)

    console.info('[client][wings:nodes:update]', {
      nodeId: id,
      ip: getRequestIP(event),
      host: getRequestHost(event, { xForwardedHost: true }),
      protocol: getRequestProtocol(event, { xForwardedProto: true }),
      url: getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }),
    })

    return { data: toWingsNodeSummary(node) }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update node'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
