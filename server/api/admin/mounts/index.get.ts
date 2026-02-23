import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { MountWithRelations } from '#shared/types/admin';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.MOUNTS, ADMIN_ACL_PERMISSIONS.READ);

  const db = useDrizzle();

  const mounts = await db.select().from(tables.mounts).orderBy(tables.mounts.name);

  const data: MountWithRelations[] = await Promise.all(
    mounts.map(async (mount) => {
      const eggs = await db
        .select({ eggId: tables.mountEgg.eggId })
        .from(tables.mountEgg)
        .where(eq(tables.mountEgg.mountId, mount.id));

      const nodes = await db
        .select({ nodeId: tables.mountNode.nodeId })
        .from(tables.mountNode)
        .where(eq(tables.mountNode.mountId, mount.id));

      const servers = await db
        .select({ serverId: tables.mountServer.serverId })
        .from(tables.mountServer)
        .where(eq(tables.mountServer.mountId, mount.id));

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
        eggs: eggs.map((e) => e.eggId),
        nodes: nodes.map((n) => n.nodeId),
        servers: servers.map((s) => s.serverId),
      };
    }),
  );

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.mount.listed',
    targetType: 'settings',
    metadata: {
      count: data.length,
    },
  });

  return { data };
});
