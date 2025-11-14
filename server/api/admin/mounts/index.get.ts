import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { MountWithRelations } from '#shared/types/admin-mounts'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()

  const mounts = await db.select().from(tables.mounts).orderBy(tables.mounts.name).all()

  const data: MountWithRelations[] = await Promise.all(
    mounts.map(async (mount) => {
      const eggs = await db
        .select({ eggId: tables.mountEgg.eggId })
        .from(tables.mountEgg)
        .where(eq(tables.mountEgg.mountId, mount.id))
        .all()

      const nodes = await db
        .select({ nodeId: tables.mountNode.nodeId })
        .from(tables.mountNode)
        .where(eq(tables.mountNode.mountId, mount.id))
        .all()

      const servers = await db
        .select({ serverId: tables.mountServer.serverId })
        .from(tables.mountServer)
        .where(eq(tables.mountServer.mountId, mount.id))
        .all()

      return {
        id: mount.id,
        uuid: mount.uuid,
        name: mount.name,
        description: mount.description,
        source: mount.source,
        target: mount.target,
        readOnly: Boolean(mount.readOnly),
        userMountable: Boolean(mount.userMountable),
        createdAt: new Date(mount.createdAt).toISOString(),
        updatedAt: new Date(mount.updatedAt).toISOString(),
        eggs: eggs.map(e => e.eggId),
        nodes: nodes.map(n => n.nodeId),
        servers: servers.map(s => s.serverId),
      }
    }),
  )

  return { data }
})
