import { type H3Event } from 'h3'
import { getNodeIdFromAuth } from '#server/utils/wings/auth'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'

interface InstallScriptResponse {
  container_image: string
  entrypoint: string
  script: string
}

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = event.context.params ?? {}
  if (!uuid || typeof uuid !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing server UUID' })
  }

  const nodeId = await getNodeIdFromAuth(event)

  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  if (server.nodeId !== nodeId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'This server is not assigned to your node',
    })
  }

  if (!server.eggId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Server configuration error',
      message: 'Server is missing egg configuration',
    })
  }

  const egg = db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, server.eggId))
    .get()

  if (!egg) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Server configuration error',
      message: 'Egg not found',
    })
  }

  const payload: InstallScriptResponse = {
    container_image: egg.scriptContainer || 'alpine:3.4',
    entrypoint: egg.scriptEntry || 'ash',
    script: egg.scriptInstall || '',
  }

  return {
    data: payload,
  }
})
