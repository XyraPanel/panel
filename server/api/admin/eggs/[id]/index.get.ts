import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { EggWithVariables } from '#shared/types/admin-nests'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const eggId = getRouterParam(event, 'id')
  if (!eggId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Egg ID is required' })
  }

  const db = useDrizzle()

  const egg = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, eggId))
    .get()

  if (!egg) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Egg not found' })
  }

  const variables = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.eggId, eggId))
    .orderBy(tables.eggVariables.name)
    .all()

  const data: EggWithVariables = {
    id: egg.id,
    uuid: egg.uuid,
    nestId: egg.nestId,
    author: egg.author,
    name: egg.name,
    description: egg.description,
    dockerImage: egg.dockerImage,
    dockerImages: egg.dockerImages ? JSON.parse(egg.dockerImages) : null,
    startup: egg.startup,
    configFiles: egg.configFiles ? JSON.parse(egg.configFiles) : null,
    configStartup: egg.configStartup ? JSON.parse(egg.configStartup) : null,
    configStop: egg.configStop,
    configLogs: egg.configLogs ? JSON.parse(egg.configLogs) : null,
    scriptContainer: egg.scriptContainer,
    scriptEntry: egg.scriptEntry,
    scriptInstall: egg.scriptInstall,
    copyScriptFrom: egg.copyScriptFrom,
    createdAt: new Date(egg.createdAt).toISOString(),
    updatedAt: new Date(egg.updatedAt).toISOString(),
    variables: variables.map(v => ({
      id: v.id,
      eggId: v.eggId,
      name: v.name,
      description: v.description,
      envVariable: v.envVariable,
      defaultValue: v.defaultValue,
      userViewable: Boolean(v.userViewable),
      userEditable: Boolean(v.userEditable),
      rules: v.rules,
      createdAt: new Date(v.createdAt).toISOString(),
      updatedAt: new Date(v.updatedAt).toISOString(),
    })),
  }

  return { data }
})
