import { createError, assertMethod } from 'h3'
import { getServerSession, isAdmin  } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { serverBuildSchema } from '#shared/schema/admin/server'

export default defineEventHandler(async (event) => {
  
  assertMethod(event, 'PATCH')

  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const identifier = getRouterParam(event, 'id')
  if (!identifier) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const body = await readValidatedBody(event, payload => serverBuildSchema.parse(payload))
  const { cpu, memory, swap, disk, io, threads, oomDisabled, databaseLimit, allocationLimit, backupLimit } = body

  const db = useDrizzle()
  const { findServerByIdentifier, invalidateServerCaches } = await import('~~/server/utils/serversStore')
  const server = await findServerByIdentifier(identifier)

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const serverId = server.id
  const [existingLimits] = db.select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .limit(1)
    .all()

  const updateData = {
    cpu: typeof cpu === 'number' ? cpu : (existingLimits?.cpu ?? 0),
    memory: typeof memory === 'number' ? memory : (existingLimits?.memory ?? 0),
    swap: typeof swap === 'number' ? swap : (existingLimits?.swap ?? 0),
    disk: typeof disk === 'number' ? disk : (existingLimits?.disk ?? 0),
    io: typeof io === 'number' ? io : (existingLimits?.io ?? 500),
    threads: threads !== undefined ? threads : (existingLimits?.threads ?? null),
    databaseLimit: databaseLimit !== undefined ? databaseLimit : (existingLimits?.databaseLimit ?? null),
    allocationLimit: allocationLimit !== undefined ? allocationLimit : (existingLimits?.allocationLimit ?? null),
    backupLimit: backupLimit !== undefined ? backupLimit : (existingLimits?.backupLimit ?? null),
    updatedAt: new Date() as Date,
  }

  if (existingLimits) {
    db.update(tables.serverLimits)
      .set(updateData)
      .where(eq(tables.serverLimits.serverId, serverId))
      .run()
    
    const [_updated] = db.select()
      .from(tables.serverLimits)
      .where(eq(tables.serverLimits.serverId, serverId))
      .limit(1)
      .all()
  } else {
    const now = new Date()
    db.insert(tables.serverLimits)
      .values({
        serverId,
        cpu: cpu ?? 0,
        memory: memory ?? 0,
        swap: swap ?? 0,
        disk: disk ?? 0,
        io: io ?? 500,
        threads: threads ?? null,
        databaseLimit: databaseLimit ?? null,
        allocationLimit: allocationLimit ?? null,
        backupLimit: backupLimit ?? null,
        memoryOverallocate: null,
        diskOverallocate: null,
        oomDisabled: server.oomDisabled ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    
    const [_inserted] = db.select()
      .from(tables.serverLimits)
      .where(eq(tables.serverLimits.serverId, serverId))
      .limit(1)
      .all()
  }

  if (oomDisabled !== undefined) {
    db.update(tables.servers)
      .set({ oomDisabled: Boolean(oomDisabled) })
      .where(eq(tables.servers.id, serverId))
      .run()
  }

  await invalidateServerCaches({
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
  })

  const { getWingsClientForServer } = await import('~~/server/utils/wings-client')
  const result = await getWingsClientForServer(server.uuid)
  const { client } = result
  
  try {
    await client.syncServer(server.uuid)
  } catch (syncError) {
    throw createError({
      statusCode: 500,
      message: `Database updated successfully, but failed to sync with Wings: ${syncError instanceof Error ? syncError.message : String(syncError)}. The changes will be applied on next server restart.`,
      data: {
        databaseUpdated: true,
        wingsSyncFailed: true,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      },
    })
  }

  return {
    success: true,
    message: 'Build configuration updated successfully',
  }
})
