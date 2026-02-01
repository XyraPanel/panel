import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import type { ServerStartupVariable } from '#shared/types/server'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { requireAccountUser } from '#server/utils/security'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
    allowOwner: true,
    allowAdmin: true,
  })

  const db = useDrizzle()

  const egg = server.eggId
    ? db
        .select()
        .from(tables.eggs)
        .where(eq(tables.eggs.id, server.eggId))
        .get()
    : null

  const envVars = db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, server.id))
    .all()

  const serverEnvMap = new Map<string, string>()
  for (const envVar of envVars) {
    serverEnvMap.set(envVar.key, envVar.value || '')
  }

  const environment: Record<string, string> = {}
  const variableRecords = new Map<string, typeof envVars[number]>()
  for (const envVar of envVars) {
    variableRecords.set(envVar.key, envVar)
  }

  const variables: ServerStartupVariable[] = []

  if (egg?.id) {
    const eggVariables = db
      .select()
      .from(tables.eggVariables)
      .where(eq(tables.eggVariables.eggId, egg.id))
      .all()

    for (const eggVar of eggVariables) {
      const variableValue = serverEnvMap.get(eggVar.envVariable) ?? eggVar.defaultValue ?? ''
      environment[eggVar.envVariable] = variableValue

      const override = variableRecords.get(eggVar.envVariable)
      variables.push({
        id: override?.id ?? `env_${server.id}_${eggVar.envVariable}`,
        serverId: server.id,
        key: eggVar.envVariable,
        value: variableValue,
        description: eggVar.description ?? override?.description ?? null,
        isEditable: Boolean(eggVar.userEditable ?? override?.isEditable ?? true),
        createdAt: new Date(override?.createdAt ?? server.createdAt ?? Date.now()).toISOString(),
        updatedAt: new Date(override?.updatedAt ?? server.updatedAt ?? Date.now()).toISOString(),
      })
    }
  }

  for (const [key, value] of serverEnvMap.entries()) {
    if (!environment[key]) {
      environment[key] = value
    }

    if (!variables.some(variable => variable.key === key)) {
      const override = variableRecords.get(key)
      variables.push({
        id: override?.id ?? `env_${server.id}_${key}`,
        serverId: server.id,
        key,
        value,
        description: override?.description ?? null,
        isEditable: override?.isEditable ?? true,
        createdAt: new Date(override?.createdAt ?? server.createdAt ?? Date.now()).toISOString(),
        updatedAt: new Date(override?.updatedAt ?? server.updatedAt ?? Date.now()).toISOString(),
      })
    }
  }

  let dockerImages: Record<string, string> = {}
  if (egg?.dockerImages) {
    try {
      dockerImages = typeof egg.dockerImages === 'string'
        ? JSON.parse(egg.dockerImages)
        : egg.dockerImages
    } catch (error) {
      console.warn('[client/startup] Failed to parse egg dockerImages:', error)
    }
  }

  if (Object.keys(dockerImages).length === 0 && egg?.dockerImage) {
    dockerImages = { [egg.name || 'Default']: egg.dockerImage }
  }

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.startup.viewed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      variableCount: variables.length,
    },
  })

  return {
    data: {
      startup: server.startup || egg?.startup || '',
      dockerImage: server.dockerImage || server.image || egg?.dockerImage || '',
      dockerImages,
      environment,
      variables,
    },
  }
})
