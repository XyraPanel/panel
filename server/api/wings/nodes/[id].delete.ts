import { createError, type H3Event } from 'h3'
import { deleteWingsNode } from '~~/server/utils/wings/nodesStore'

export default defineEventHandler((event: H3Event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  try {
    deleteWingsNode(id)
    return { data: { id } }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete node'
    throw createError({ statusCode: 404, statusMessage: message })
  }
})
