import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { NestWithEggCount } from '#shared/types/admin';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.READ);

  const db = useDrizzle();

  const nests = await db
    .select({
      id: tables.nests.id,
      uuid: tables.nests.uuid,
      author: tables.nests.author,
      name: tables.nests.name,
      description: tables.nests.description,
      createdAt: tables.nests.createdAt,
      updatedAt: tables.nests.updatedAt,
      eggCount: sql<number>`count(${tables.eggs.id})`.as('eggCount'),
    })
    .from(tables.nests)
    .leftJoin(tables.eggs, eq(tables.eggs.nestId, tables.nests.id))
    .groupBy(tables.nests.id)
    .orderBy(tables.nests.name);

  const data: NestWithEggCount[] = nests.map((nest) => ({
    id: nest.id,
    uuid: nest.uuid,
    author: nest.author,
    name: nest.name,
    description: nest.description,
    createdAt: new Date(nest.createdAt).toISOString(),
    updatedAt: new Date(nest.updatedAt).toISOString(),
    eggCount: Number(nest.eggCount) || 0,
  }));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.nest.listed',
    targetType: 'settings',
    metadata: {
      count: data.length,
    },
  });

  return { data };
});
