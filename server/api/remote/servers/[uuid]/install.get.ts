import { createError, getQuery, type H3Event } from 'h3'
import { getNodeIdFromQuery } from '~~/server/utils/wings/http'
import { getInstallationScript } from '~~/server/utils/wings/registry'

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = event.context.params ?? {}
  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  const query = getQuery(event)
  const nodeId = getNodeIdFromQuery(query)

  const script = await getInstallationScript(uuid, nodeId)
  if (!script) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  return script
})
