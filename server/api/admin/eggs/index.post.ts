import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { CreateEggPayload } from '#shared/types/admin-nests'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

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
