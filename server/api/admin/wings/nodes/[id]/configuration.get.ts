import { createError, defineEventHandler } from 'h3'

import { getWingsNodeConfigurationById } from '~~/server/utils/wings/nodesStore'
import { useRuntimeConfig } from '#imports'

export default defineEventHandler((event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const runtimeConfig = useRuntimeConfig()
  const panelConfig = (runtimeConfig.public?.app ?? {}) as { baseUrl?: string }
  const requestOrigin = typeof event.node.req.headers.origin === 'string' ? event.node.req.headers.origin : ''
  const panelUrl = panelConfig.baseUrl || requestOrigin || ''

  try {
    const configuration = getWingsNodeConfigurationById(id, panelUrl)
    return { data: configuration }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build node configuration'
    throw createError({ statusCode: 404, statusMessage: message })
  }
})
