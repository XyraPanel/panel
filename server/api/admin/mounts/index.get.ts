import { inArray, count } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { AdminMountListItem } from '#shared/types/admin';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.MOUNTS, ADMIN_ACL_PERMISSIONS.READ);

  const db = useDrizzle();
  const query = getQuery(event);
  const view = Array.isArray(query.view) ? query.view[0] : query.view;

  if (view === 'options') {
    const options = await db
      .select({
        id: tables.mounts.id,
        name: tables.mounts.name,
      })
      .from(tables.mounts)
      .orderBy(tables.mounts.name);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.mount.options.listed',
      targetType: 'settings',
      metadata: {
        count: options.length,
      },
    });

    return { data: options };
  }

  const mounts = await db
    .select({
      id: tables.mounts.id,
      uuid: tables.mounts.uuid,
      name: tables.mounts.name,
      description: tables.mounts.description,
      source: tables.mounts.source,
      target: tables.mounts.target,
      readOnly: tables.mounts.readOnly,
      userMountable: tables.mounts.userMountable,
      createdAt: tables.mounts.createdAt,
      updatedAt: tables.mounts.updatedAt,
    })
    .from(tables.mounts)
    .orderBy(tables.mounts.name);

  const mountIds = mounts.map((mount) => mount.id);
  const [eggCounts, nodeCounts, serverCounts] =
    mountIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select({ mountId: tables.mountEgg.mountId, value: count() })
            .from(tables.mountEgg)
            .where(inArray(tables.mountEgg.mountId, mountIds))
            .groupBy(tables.mountEgg.mountId),
          db
            .select({ mountId: tables.mountNode.mountId, value: count() })
            .from(tables.mountNode)
            .where(inArray(tables.mountNode.mountId, mountIds))
            .groupBy(tables.mountNode.mountId),
          db
            .select({ mountId: tables.mountServer.mountId, value: count() })
            .from(tables.mountServer)
            .where(inArray(tables.mountServer.mountId, mountIds))
            .groupBy(tables.mountServer.mountId),
        ]);

  const eggCountMap = new Map(eggCounts.map((row) => [row.mountId, Number(row.value) || 0]));
  const nodeCountMap = new Map(nodeCounts.map((row) => [row.mountId, Number(row.value) || 0]));
  const serverCountMap = new Map(
    serverCounts.map((row) => [row.mountId, Number(row.value) || 0]),
  );

  const data: AdminMountListItem[] = mounts.map((mount) => ({
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
    eggCount: eggCountMap.get(mount.id) ?? 0,
    nodeCount: nodeCountMap.get(mount.id) ?? 0,
    serverCount: serverCountMap.get(mount.id) ?? 0,
  }));

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
