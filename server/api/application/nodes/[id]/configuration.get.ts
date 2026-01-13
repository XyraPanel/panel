import { createError, defineEventHandler, getHeader } from 'h3'
import { getWingsNodeConfigurationById } from '~~/server/utils/wings/nodesStore'
import { parseAuthToken, decryptToken } from '~~/server/utils/wings/encryption'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { useRuntimeConfig, getRequestURL } from '#imports'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node UUID' })
  }

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const tokenData = parseAuthToken(authHeader)
  if (!tokenData) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid authorization token format' })
  }

  const db = useDrizzle()
  const nodeRow = db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.uuid, id))
    .get()

  if (!nodeRow) {
    throw createError({ statusCode: 404, statusMessage: 'Node not found' })
  }

  if (!nodeRow.tokenIdentifier || !nodeRow.tokenSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Node has no valid token' })
  }

  if (tokenData.tokenId !== nodeRow.tokenIdentifier) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token identifier' })
  }

  let decryptedSecret: string
  try {
    decryptedSecret = decryptToken(nodeRow.tokenSecret)
  } catch (error) {
    throw createError({ 
      statusCode: 500, 
      statusMessage: 'Token decryption failed',
      message: error instanceof Error ? error.message : 'Failed to decrypt token'
    })
  }

  if (tokenData.token !== decryptedSecret) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token secret' })
  }

  const config = useRuntimeConfig()
  const requestURL = getRequestURL(event)
  const requestOrigin = `${requestURL.protocol}//${requestURL.host}`
  const panelConfig = config.public.panel as { baseUrl?: string } | undefined
  const panelUrl = panelConfig?.baseUrl || requestOrigin || ''
  
  try {
    const configuration = getWingsNodeConfigurationById(nodeRow.id, panelUrl)
    return configuration
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build node configuration'
    throw createError({ statusCode: 500, statusMessage: message })
  }
})
