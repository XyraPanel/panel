import { createError, getQuery, type H3Event } from 'h3'
import { listServers, paginateServers } from '~~/server/utils/wings/registry'
import { getNodeIdFromQuery, toWingsHttpError } from '~~/server/utils/wings/http'

export default defineEventHandler(async (event: H3Event) => {
  const query = getQuery(event)
  const page = Number(query.page ?? '1')
  const perPage = Number(query.per_page ?? '50')
  const nodeId = getNodeIdFromQuery(query)

  if (Number.isNaN(page) || Number.isNaN(perPage) || perPage <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid pagination parameters',
      data: {
        errors: [{ detail: 'Use positive numeric values for page and per_page.' }],
      },
    })
  }

  try {
    if ('page' in query || 'per_page' in query) {
      return await paginateServers(page, perPage, nodeId)
    }

    const servers = await listServers(nodeId)
    return {
      data: servers.map(server => ({
        uuid: server.uuid,
        identifier: server.identifier,
        node: server.node,
        name: server.name,
      })),
    }
  }
  catch (error) {
    throw toWingsHttpError(error, { operation: 'list Wings servers', nodeId })
  }
})
