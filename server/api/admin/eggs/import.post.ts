import { randomUUID } from 'node:crypto'
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import type { EggImportResponse } from '#shared/types/admin'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { eggImportSchema } from '#shared/schema/admin/eggs'

export default defineEventHandler(async (event): Promise<EggImportResponse> => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE)

  const { nestId, eggData } = await readValidatedBodyWithLimit(event, eggImportSchema, BODY_SIZE_LIMITS.MEDIUM)

  if (!nestId || !eggData) {
    throw createError({ 
      status: 400, 
      statusText: 'Nest ID and egg data are required',
      message: 'Missing nestId or eggData in request body'
    })
  }

  const metaVersion = eggData.meta?.version
  if (!metaVersion || !['PTDL_v1', 'PTDL_v2'].includes(metaVersion)) {
    throw createError({ 
      status: 400, 
      statusText: `Invalid egg format. Expected PTDL_v1 or PTDL_v2, got: ${metaVersion || 'none'}`,
      message: `The egg file must have a valid meta.version field (PTDL_v1 or PTDL_v2)`
    })
  }

  if (!eggData.name || !eggData.author) {
    throw createError({ 
      status: 400, 
      statusText: 'Egg must have name and author fields',
      message: `Missing required fields: ${!eggData.name ? 'name' : ''} ${!eggData.author ? 'author' : ''}`
    })
  }

  const db = useDrizzle()

  const [nest] = await db
    .select()
    .from(tables.nests)
    .where(eq(tables.nests.id, nestId))

  if (!nest) {
    throw createError({ status: 404, statusText: 'Nest not found' })
  }

  const now = new Date()
  const eggId = randomUUID()

  const dockerImages = eggData.docker_images || {}
  const firstImage = Object.values(dockerImages)[0] || 'ghcr.io/pterodactyl/yolks:latest'

  const normalizeConfigField = (field: string | Record<string, unknown> | undefined): string => {
    if (!field) return '{}'
    if (typeof field === 'string') return field
    return JSON.stringify(field)
  }

  await db.insert(tables.eggs).values({
    id: eggId,
    uuid: randomUUID(),
    nestId,
    author: eggData.author || 'unknown@unknown.com',
    name: eggData.name,
    description: eggData.description || null,
    features: eggData.features ? JSON.stringify(eggData.features) : null,
    fileDenylist: eggData.file_denylist ? JSON.stringify(eggData.file_denylist) : null,
    updateUrl: eggData.meta?.update_url || null,
    dockerImage: firstImage,
    dockerImages: JSON.stringify(dockerImages),
    startup: eggData.startup || '',
    configFiles: normalizeConfigField(eggData.config?.files),
    configStartup: normalizeConfigField(eggData.config?.startup),
    configLogs: normalizeConfigField(eggData.config?.logs),
    configStop: eggData.config?.stop || 'stop',
    scriptInstall: eggData.scripts?.installation?.script || '',
    scriptContainer: eggData.scripts?.installation?.container || 'alpine:3.4',
    scriptEntry: eggData.scripts?.installation?.entrypoint || 'ash',
    copyScriptFrom: null,
    createdAt: now,
    updatedAt: now,
  })

  if (eggData.variables && eggData.variables.length > 0) {
    const variableValues = eggData.variables.map(variable => ({
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
    }))

    if (variableValues.length > 0) {
      await db.insert(tables.eggVariables).values(variableValues)
    }
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.imported',
    targetType: 'settings',
    targetId: eggId,
    metadata: {
      eggName: eggData.name,
      nestId,
      variableCount: eggData.variables?.length || 0,
    },
  })

  return {
    success: true,
    data: { id: eggId },
  }
})
