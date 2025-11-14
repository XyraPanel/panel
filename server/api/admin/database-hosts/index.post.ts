import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { CreateDatabaseHostPayload } from '#shared/types/admin-database-hosts'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<CreateDatabaseHostPayload>(event)

  if (!body.name || !body.hostname || !body.username || !body.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Name, hostname, username, and password are required',
    })
  }

  const db = useDrizzle()
  const now = new Date()

  const newHost = {
    id: randomUUID(),
    name: body.name,
    hostname: body.hostname,
    port: body.port || 3306,
    username: body.username,
    password: body.password,
    database: body.database || null,
    nodeId: body.nodeId || null,
    maxDatabases: body.maxDatabases || null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.databaseHosts).values(newHost)

  return {
    data: {
      id: newHost.id,
      name: newHost.name,
      hostname: newHost.hostname,
      port: newHost.port,
      createdAt: newHost.createdAt.toISOString(),
      updatedAt: newHost.updatedAt.toISOString(),
    },
  }
})
