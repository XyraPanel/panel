import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const backupUuid = getRouterParam(event, 'backup')

  if (!serverId || !backupUuid) {
    throw createError({
      statusCode: 400,
      message: 'Server and backup identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const [backup] = db.select()
    .from(tables.serverBackups)
    .where(
      and(
        eq(tables.serverBackups.serverId, server.id),
        eq(tables.serverBackups.uuid, backupUuid)
      )
    )
    .limit(1)
    .all()

  if (!backup) {
    throw createError({
      statusCode: 404,
      message: 'Backup not found',
    })
  }

  const newLockStatus = !backup.isLocked

  db.update(tables.serverBackups)
    .set({
      isLocked: newLockStatus,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverBackups.id, backup.id))
    .run()

  return {
    object: 'backup',
    attributes: {
      uuid: backup.uuid,
      name: backup.name,
      is_locked: newLockStatus,
    },
  }
})
