import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDrizzle()

  const [user] = db.select()
    .from(tables.users)
    .where(eq(tables.users.email, session.user.email))
    .limit(1)
    .all()

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'User not found',
    })
  }

  const servers = db.select({
    id: tables.servers.id,
    uuid: tables.servers.uuid,
    identifier: tables.servers.identifier,
    externalId: tables.servers.externalId,
    name: tables.servers.name,
    description: tables.servers.description,
    status: tables.servers.status,
    suspended: tables.servers.suspended,
    nodeId: tables.servers.nodeId,
    allocationId: tables.servers.allocationId,
    image: tables.servers.image,
    databaseLimit: tables.servers.databaseLimit,
    allocationLimit: tables.servers.allocationLimit,
    backupLimit: tables.servers.backupLimit,
    installedAt: tables.servers.installedAt,
    createdAt: tables.servers.createdAt,
    updatedAt: tables.servers.updatedAt,
  })
    .from(tables.servers)
    .where(eq(tables.servers.ownerId, user.id))
    .all()

  const serversWithDetails = servers.map((server) => {

    const [limits] = db.select()
      .from(tables.serverLimits)
      .where(eq(tables.serverLimits.serverId, server.id))
      .limit(1)
      .all()

    let primaryAllocation = null
    if (server.allocationId) {
      const [alloc] = db.select()
        .from(tables.serverAllocations)
        .where(eq(tables.serverAllocations.id, server.allocationId))
        .limit(1)
        .all()
      primaryAllocation = alloc
    }

    const allocations = db.select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.serverId, server.id))
      .all()

    return {
      server_owner: true,
      identifier: server.identifier,
      internal_id: server.id,
      uuid: server.uuid,
      name: server.name,
      node: server.nodeId,
      sftp_details: {
        ip: primaryAllocation?.ip || '',
        port: 2022,
      },
      description: server.description || '',
      limits: {
        memory: limits?.memory || 0,
        swap: limits?.swap || 0,
        disk: limits?.disk || 0,
        io: limits?.io || 500,
        cpu: limits?.cpu || 0,
        threads: limits?.threads || null,
        oom_disabled: limits?.oomDisabled ?? true,
      },
      invocation: server.image || '',
      docker_image: server.image || '',
      egg_features: [],
      feature_limits: {
        databases: server.databaseLimit || 0,
        allocations: server.allocationLimit || 0,
        backups: server.backupLimit || 0,
      },
      status: server.status,
      is_suspended: server.suspended,
      is_installing: server.status === 'installing',
      is_installed: !!server.installedAt,
      is_transferring: server.status === 'transferring',
      relationships: {
        allocations: {
          object: 'list',
          data: allocations.map(alloc => ({
            id: alloc.id,
            ip: alloc.ip,
            ip_alias: alloc.ipAlias,
            port: alloc.port,
            notes: alloc.notes,
            is_default: alloc.id === server.allocationId,
          })),
        },
      },
    }
  })

  return {
    object: 'list',
    data: serversWithDetails,
  }
})
