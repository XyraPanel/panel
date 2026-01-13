import { requireAdmin } from '~~/server/utils/security'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { requireAdminApiKeyPermission } from '~~/server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '~~/server/utils/admin-acl'
import type { CreateEggPayload } from '#shared/types/admin'
import { randomUUID } from 'node:crypto'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE)

  const body = await readBody<CreateEggPayload>(event)

  if (!body.nestId || !body.name || !body.author || !body.dockerImage || !body.startup) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Nest ID, name, author, docker image, and startup command are required',
    })
  }

  const db = useDrizzle()
  const now = new Date()

  const newEgg = {
    id: randomUUID(),
    uuid: randomUUID(),
    nestId: body.nestId,
    author: body.author,
    name: body.name,
    description: body.description || null,
    features: body.features ? JSON.stringify(body.features) : null,
    fileDenylist: body.fileDenylist ? JSON.stringify(body.fileDenylist) : null,
    updateUrl: body.updateUrl || null,
    dockerImage: body.dockerImage,
    dockerImages: body.dockerImages ? JSON.stringify(body.dockerImages) : null,
    startup: body.startup,
    configFiles: body.configFiles ? JSON.stringify(body.configFiles) : null,
    configStartup: body.configStartup ? JSON.stringify(body.configStartup) : null,
    configStop: body.configStop || null,
    configLogs: body.configLogs ? JSON.stringify(body.configLogs) : null,
    scriptContainer: body.scriptContainer || null,
    scriptEntry: body.scriptEntry || null,
    scriptInstall: body.scriptInstall || null,
    copyScriptFrom: body.copyScriptFrom || null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.eggs).values(newEgg)

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.created',
    targetType: 'settings',
    targetId: newEgg.id,
    metadata: {
      eggName: newEgg.name,
      nestId: newEgg.nestId,
    },
  })

  return {
    data: {
      id: newEgg.id,
      uuid: newEgg.uuid,
      nestId: newEgg.nestId,
      author: newEgg.author,
      name: newEgg.name,
      description: newEgg.description,
      dockerImage: newEgg.dockerImage,
      startup: newEgg.startup,
      createdAt: newEgg.createdAt.toISOString(),
      updatedAt: newEgg.updatedAt.toISOString(),
    },
  }
})
