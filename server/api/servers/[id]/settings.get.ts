import { eq } from 'drizzle-orm'
import type { SettingsData } from '#shared/types/server'
import { useDrizzle, tables } from '#server/utils/drizzle'
import { requireAccountUser } from '#server/utils/security'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id')
  if (!identifier) {
    throw createError({ status: 400, statusText: 'Missing server identifier' })
  }

  const { user, session } = await requireAccountUser(event)

  const { server } = await getServerWithAccess(identifier, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  })

  const db = useDrizzle()
  const limitsRow = await db
    .select({
      cpu: tables.serverLimits.cpu,
      memory: tables.serverLimits.memory,
      disk: tables.serverLimits.disk,
      swap: tables.serverLimits.swap,
      io: tables.serverLimits.io,
      threads: tables.serverLimits.threads,
      oomDisabled: tables.serverLimits.oomDisabled,
      databaseLimit: tables.serverLimits.databaseLimit,
      allocationLimit: tables.serverLimits.allocationLimit,
      backupLimit: tables.serverLimits.backupLimit,
    })
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .limit(1)
    .get()

  const response: SettingsData = {
    server: {
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
      name: server.name,
      description: server.description,
      suspended: Boolean(server.suspended),
    },
    limits: limitsRow
      ? {
          cpu: limitsRow.cpu,
          memory: limitsRow.memory,
          disk: limitsRow.disk,
          swap: limitsRow.swap,
          io: limitsRow.io,
          threads: limitsRow.threads ?? null,
          oomDisabled: limitsRow.oomDisabled ?? true,
          databaseLimit: limitsRow.databaseLimit ?? null,
          allocationLimit: limitsRow.allocationLimit ?? null,
          backupLimit: limitsRow.backupLimit ?? null,
        }
      : null,
  }

  await Promise.all([
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.settings.viewed',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        serverUuid: server.uuid,
      },
    }),
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.settings.viewed',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        context: 'server.settings',
      },
    }),
  ])

  return {
    data: response,
  }
})
