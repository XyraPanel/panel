import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.READ);

  const nestId = getRouterParam(event, 'id');
  if (!nestId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Nest ID is required' });
  }

  const db = useDrizzle();

  const [nest] = await db.select().from(tables.nests).where(eq(tables.nests.id, nestId)).limit(1);

  if (!nest) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Nest not found' });
  }

  const eggs = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.nestId, nestId))
    .orderBy(tables.eggs.name);

  const data = {
    nest: {
      id: nest.id,
      uuid: nest.uuid,
      author: nest.author,
      name: nest.name,
      description: nest.description,
      createdAt: new Date(nest.createdAt).toISOString(),
      updatedAt: new Date(nest.updatedAt).toISOString(),
    },
    eggs: eggs.map((egg) => ({
      id: egg.id,
      uuid: egg.uuid,
      nestId: egg.nestId,
      author: egg.author,
      name: egg.name,
      description: egg.description,
      dockerImage: egg.dockerImage,
      createdAt: new Date(egg.createdAt).toISOString(),
      updatedAt: new Date(egg.updatedAt).toISOString(),
    })),
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.nest.viewed',
    targetType: 'settings',
    targetId: nestId,
    metadata: {
      eggCount: eggs.length,
    },
  });

  return { data };
});
