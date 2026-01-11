import { createError, assertMethod } from 'h3'
import { requireAdmin } from '~~/server/utils/security'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { requireAdminApiKeyPermission } from '~~/server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '~~/server/utils/admin-acl'
import { serverBuildSchema } from '#shared/schema/admin/server'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  
  assertMethod(event, 'PATCH')

  const session = await requireAdmin(event)
  
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.SERVERS, ADMIN_ACL_PERMISSIONS.WRITE)

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
    cpu: typeof cpu === 'number' ? cpu : (existingLimits?.cpu ?? 100),
    memory: typeof memory === 'number' ? memory : (existingLimits?.memory ?? 512),
    swap: typeof swap === 'number' ? swap : (existingLimits?.swap ?? 0),
    disk: typeof disk === 'number' ? disk : (existingLimits?.disk ?? 1024),
    io: typeof io === 'number' ? io : (existingLimits?.io ?? 500),
    threads: threads !== undefined ? threads : (existingLimits?.threads ?? null),
    databaseLimit: databaseLimit !== undefined ? databaseLimit : (existingLimits?.databaseLimit ?? null),
    allocationLimit: allocationLimit !== undefined ? allocationLimit : (existingLimits?.allocationLimit ?? null),
    backupLimit: backupLimit !== undefined ? backupLimit : (existingLimits?.backupLimit ?? 3),
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
        cpu: cpu ?? 100,
        memory: memory ?? 512,
        swap: swap ?? 0,
        disk: disk ?? 1024,
        io: io ?? 500,
        threads: threads ?? null,
        databaseLimit: databaseLimit ?? null,
        allocationLimit: allocationLimit ?? null,
        backupLimit: backupLimit ?? 3,
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

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.build.updated',
    targetType: 'server',
    targetId: serverId,
    metadata: {
      serverUuid: server.uuid,
      updatedFields: Object.keys(body),
    },
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
