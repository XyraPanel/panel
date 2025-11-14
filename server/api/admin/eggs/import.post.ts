import { createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

interface EggImportData {
  name: string
  author?: string
  description?: string
  docker_images?: Record<string, string>
  startup?: string
  config?: {
    files?: Record<string, unknown>
    startup?: Record<string, unknown>
    logs?: Record<string, unknown>
    stop?: string
  }
  scripts?: {
    installation?: {
      script?: string
      container?: string
      entrypoint?: string
    }
  }
  variables?: Array<{
    name: string
    description?: string
    env_variable: string
    default_value?: string
    user_viewable?: boolean
    user_editable?: boolean
    rules?: string
  }>
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const { nestId, eggData } = body as { nestId: string; eggData: EggImportData }

  if (!nestId || !eggData) {
    throw createError({ statusCode: 400, statusMessage: 'Nest ID and egg data are required' })
  }

  const db = useDrizzle()

  const nest = await db
    .select()
    .from(tables.nests)
    .where(eq(tables.nests.id, nestId))
    .get()

  if (!nest) {
    throw createError({ statusCode: 404, statusMessage: 'Nest not found' })
  }

  const now = new Date()
  const eggId = randomUUID()

  const dockerImages = eggData.docker_images || {}
  const firstImage = Object.values(dockerImages)[0] || 'ghcr.io/pterodactyl/yolks:latest'

  await db.insert(tables.eggs).values({
    id: eggId,
    uuid: randomUUID(),
    nestId,
    author: eggData.author || 'unknown@unknown.com',
    name: eggData.name,
    description: eggData.description || null,
    dockerImage: firstImage,
    dockerImages: JSON.stringify(dockerImages),
    startup: eggData.startup || '',
    configFiles: JSON.stringify(eggData.config?.files || {}),
    configStartup: JSON.stringify(eggData.config?.startup || {}),
    configLogs: JSON.stringify(eggData.config?.logs || {}),
    configStop: eggData.config?.stop || 'stop',
    scriptInstall: eggData.scripts?.installation?.script || '',
    scriptContainer: eggData.scripts?.installation?.container || 'alpine:3.4',
    scriptEntry: eggData.scripts?.installation?.entrypoint || 'ash',
    copyScriptFrom: null,
    createdAt: now,
    updatedAt: now,
  }).run()

  if (eggData.variables && eggData.variables.length > 0) {
    for (const variable of eggData.variables) {
      await db.insert(tables.eggVariables).values({
        id: randomUUID(),
        eggId,
        name: variable.name,
        description: variable.description || null,
        envVariable: variable.env_variable,
        defaultValue: variable.default_value || null,
        userViewable: variable.user_viewable !== false,
        userEditable: variable.user_editable !== false,
        rules: variable.rules || 'required|string',
        createdAt: now,
        updatedAt: now,
      }).run()
    }
  }

  return {
    success: true,
    data: { id: eggId },
  }
})
