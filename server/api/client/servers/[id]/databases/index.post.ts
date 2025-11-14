import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { randomUUID } from 'crypto'

interface CreateDatabasePayload {
  name: string
  remote: string
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

  const body = await readBody<CreateDatabasePayload>(event)

  if (!body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Database name is required',
    })
  }

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

  const dbHost = await db.select().from(tables.databaseHosts).limit(1).get()

  if (!dbHost) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'No database hosts available',
    })
  }

  const dbUsername = `s${serverId.substring(0, 8)}_${body.name}`.substring(0, 32)
  const dbPassword = randomUUID().replace(/-/g, '').substring(0, 32)

  const now = new Date()

  const newDatabase = {
    id: randomUUID(),
    serverId,
    databaseHostId: dbHost.id,
    name: body.name,
    username: dbUsername,
    password: dbPassword,
    remote: body.remote || '%',
    maxConnections: 0,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.serverDatabases).values(newDatabase)

  return {
    data: {
      id: newDatabase.id,
      name: newDatabase.name,
      username: newDatabase.username,
      password: newDatabase.password,
      host: dbHost.hostname,
      port: dbHost.port,
      remote: newDatabase.remote,
      createdAt: newDatabase.createdAt.toISOString(),
    },
  }
})
