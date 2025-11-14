import { createError, defineEventHandler, type H3Event } from 'h3'
import { issueWingsNodeToken, findWingsNode } from '~~/server/utils/wings/nodesStore'

export default defineEventHandler((event: H3Event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const existing = findWingsNode(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  }

  try {
    const { token, node } = issueWingsNodeToken(id)
    return {
      data: {
        node,
        token,
      },
    }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to issue token'
    throw createError({ statusCode: 500, statusMessage: message })
  }
})
