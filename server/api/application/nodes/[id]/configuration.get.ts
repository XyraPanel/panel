import { createError, defineEventHandler } from 'h3'

import { getNodeIdFromAuth } from '~~/server/utils/wings/auth'
import { getWingsNodeConfigurationById } from '~~/server/utils/wings/nodesStore'
import { useRuntimeConfig, getRequestURL } from '#imports'

export default defineEventHandler(async (event) => {
  const { id: requestedId } = event.context.params ?? {}
  if (requestedId !== undefined && typeof requestedId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  if (requestedId && requestedId !== nodeId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const runtimeConfig = useRuntimeConfig()
  const publicAppConfig = (runtimeConfig.public?.app ?? {}) as { baseUrl?: string }
  const requestUrl = getRequestURL(event)
  const panelUrl = publicAppConfig.baseUrl
    || `${requestUrl.protocol}//${requestUrl.host}`

  try {
    const configuration = getWingsNodeConfigurationById(nodeId, panelUrl)
    return { data: configuration }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build node configuration'
    throw createError({ statusCode: 404, statusMessage: message })
  }
})
