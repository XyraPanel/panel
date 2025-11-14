import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { CreateServerPayload } from '#shared/types/admin-servers'
import { randomUUID } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { provisionServerOnWings } from '~~/server/utils/server-provisioning'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<CreateServerPayload>(event)

  if (!body.name || !body.ownerId || !body.eggId || !body.nodeId || !body.allocationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Name, owner, egg, node, and allocation are required',
    })
  }

  const db = useDrizzle()
  const now = new Date()

  const egg = await db.select().from(tables.eggs).where(eq(tables.eggs.id, body.eggId)).get()
  if (!egg) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Egg not found' })
  }

  const node = await db.select().from(tables.wingsNodes).where(eq(tables.wingsNodes.id, body.nodeId)).get()
  if (!node) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Node not found' })
  }

  const owner = await db.select().from(tables.users).where(eq(tables.users.id, body.ownerId)).get()
  if (!owner) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Owner not found' })
  }

  const allocation = await db.select({
    id: tables.serverAllocations.id,
    nodeId: tables.serverAllocations.nodeId,
    serverId: tables.serverAllocations.serverId,
    ip: tables.serverAllocations.ip,
    port: tables.serverAllocations.port,
  })
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, body.allocationId))
    .get()

  if (!allocation) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Allocation not found' })
  }

  if (allocation.serverId) {
    throw createError({ statusCode: 409, statusMessage: 'Allocation in use', message: 'Allocation already assigned to a server' })
  }

  if (allocation.nodeId !== body.nodeId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid allocation', message: 'Allocation does not belong to selected node' })
  }

  const serverUuid = randomUUID()
  const serverId = randomUUID()
  const identifier = randomUUID().substring(0, 8)

  const newServer = {
    id: serverId,
    uuid: serverUuid,
    identifier,
    name: body.name,
    description: body.description || null,
    status: 'installing',
    suspended: false,
    ownerId: body.ownerId,
    nodeId: body.nodeId,
    allocationId: allocation.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.servers).values(newServer)

  await db.insert(tables.serverLimits).values({
    serverId,
    memory: body.memory,
    swap: body.swap,
    disk: body.disk,
    io: body.io,
    cpu: body.cpu,
    createdAt: now,
    updatedAt: now,
  })

  await db.update(tables.serverAllocations)
    .set({
      serverId,
      isPrimary: true,
      updatedAt: now,
    })
    .where(and(eq(tables.serverAllocations.id, allocation.id), isNull(tables.serverAllocations.serverId)))

  if (body.environment) {
    const envVars = Object.entries(body.environment).map(([key, value]) => ({
      id: randomUUID(),
      serverId,
      key,
      value,
      description: null,
      isEditable: true,
      createdAt: now,
      updatedAt: now,
    }))
    if (envVars.length > 0) {
      await db.insert(tables.serverStartupEnv).values(envVars)
    }
  }

  try {
    await provisionServerOnWings({
      serverId,
      serverUuid,
      eggId: body.eggId,
      nodeId: body.nodeId,
      allocationId: allocation.id,
      environment: body.environment,
    })
  } catch (error) {
    console.error('Failed to provision server on Wings:', error)

    await db.update(tables.servers)
      .set({
        status: 'install_failed',
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.id, serverId))
      .run()

    throw createError({
      statusCode: 500,
      statusMessage: 'Server provisioning failed',
      message: error instanceof Error ? error.message : 'Failed to provision server on Wings',
    })
  }

  return {
    data: {
      id: newServer.id,
      uuid: newServer.uuid,
      identifier: newServer.identifier,
      name: newServer.name,
      status: 'installing',
      createdAt: newServer.createdAt.toISOString(),
    },
  }
})
