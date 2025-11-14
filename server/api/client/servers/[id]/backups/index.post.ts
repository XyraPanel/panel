import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

interface CreateBackupPayload {
  name?: string
  locked?: boolean
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Server ID is required' })
  }

  const body = await readBody<CreateBackupPayload>(event)
  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Server not found' })
  }

  if (server.ownerId !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const now = new Date()
  const backupUuid = randomUUID()

  const newBackup = {
    id: randomUUID(),
    uuid: backupUuid,
    serverId,
    name: body.name || `Backup ${new Date().toISOString()}`,
    ignoredFiles: '',
    disk: 'local',
    sha256Hash: null,
    bytes: 0,
    isSuccessful: false,
    isLocked: body.locked ?? false,
    uploadedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.serverBackups).values(newBackup)

  return {
    data: {
      id: newBackup.id,
      uuid: newBackup.uuid,
      name: newBackup.name,
      isLocked: newBackup.isLocked,
      createdAt: newBackup.createdAt.toISOString(),
    },
  }
})
