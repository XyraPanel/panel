import { createError, getQuery, type H3Event } from 'h3'
import { getNodeIdFromQuery } from '~~/server/utils/wings/http'
import { getServerConfiguration } from '~~/server/utils/wings/registry'

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = event.context.params ?? {}
  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  const query = getQuery(event)
  const nodeId = getNodeIdFromQuery(query)

  const config = await getServerConfiguration(uuid, nodeId)
  if (!config) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  return config
})
