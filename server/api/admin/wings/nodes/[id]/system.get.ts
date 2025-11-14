import { createError, defineEventHandler, getQuery } from 'h3'

import { remoteGetSystemInformation } from '~~/server/utils/wings/registry'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  const query = getQuery(event)
  const versionParam = typeof query.v === 'string' ? Number.parseInt(query.v, 10) : undefined
  const version = Number.isFinite(versionParam ?? NaN) ? versionParam : undefined

  const systemInfo = await remoteGetSystemInformation(id, version)
  return { data: systemInfo }
})
