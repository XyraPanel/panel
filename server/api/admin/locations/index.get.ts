import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { LocationWithNodeCount } from '#shared/types/admin';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.LOCATIONS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const db = useDrizzle();

  const locations = await db
    .select({
      id: tables.locations.id,
      short: tables.locations.short,
      long: tables.locations.long,
      createdAt: tables.locations.createdAt,
      updatedAt: tables.locations.updatedAt,
      nodeCount: sql<number>`count(${tables.wingsNodes.id})`.as('nodeCount'),
    })
    .from(tables.locations)
    .leftJoin(tables.wingsNodes, eq(tables.wingsNodes.locationId, tables.locations.id))
    .groupBy(tables.locations.id)
    .orderBy(tables.locations.short);

  const data: LocationWithNodeCount[] = locations.map((loc) => ({
    id: loc.id,
    short: loc.short,
    long: loc.long,
    createdAt: new Date(loc.createdAt).toISOString(),
    updatedAt: new Date(loc.updatedAt).toISOString(),
    nodeCount: Number(loc.nodeCount) || 0,
  }));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.location.listed',
    targetType: 'settings',
    metadata: {
      count: data.length,
    },
  });

  return { data };
});
