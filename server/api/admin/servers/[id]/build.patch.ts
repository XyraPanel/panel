import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const body = await readBody(event)
  const { cpu, memory, swap, disk, io, threads, oomDisabled, databaseLimit, allocationLimit, backupLimit } = body

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const updateData: Record<string, number> = {}
  if (cpu !== undefined) updateData.cpu = cpu
  if (memory !== undefined) updateData.memory = memory
  if (swap !== undefined) updateData.swap = swap
  if (disk !== undefined) updateData.disk = disk
  if (io !== undefined) updateData.io = io
  if (threads !== undefined) updateData.threads = threads
  if (databaseLimit !== undefined) updateData.databaseLimit = databaseLimit
  if (allocationLimit !== undefined) updateData.allocationLimit = allocationLimit
  if (backupLimit !== undefined) updateData.backupLimit = backupLimit

  if (Object.keys(updateData).length > 0) {
    db.update(tables.serverLimits)
      .set(updateData)
      .where(eq(tables.serverLimits.serverId, serverId))
      .run()
  }

  if (oomDisabled !== undefined) {
    db.update(tables.servers)
      .set({ oomDisabled: Boolean(oomDisabled) })
      .where(eq(tables.servers.id, serverId))
      .run()
  }

  return {
    success: true,
    message: 'Build configuration updated successfully',
  }
})
