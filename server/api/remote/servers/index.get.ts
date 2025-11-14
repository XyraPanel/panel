import { createError, getQuery, type H3Event } from 'h3'
import { paginateServers } from '~~/server/utils/wings/registry'
import { getNodeIdFromQuery } from '~~/server/utils/wings/http'

export default defineEventHandler((event: H3Event) => {
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

  return paginateServers(page, perPage, nodeId)
})
