import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { createNestSchema } from '#shared/schema/admin/infrastructure';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.WRITE);

  const body = await readValidatedBodyWithLimit(event, createNestSchema, BODY_SIZE_LIMITS.SMALL);

  const db = useDrizzle();
  const now = new Date();

  const newNest = {
    id: randomUUID(),
    uuid: randomUUID(),
    author: body.author.trim(),
    name: body.name.trim(),
    description: body.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tables.nests).values(newNest);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.nest.created',
    targetType: 'settings',
    targetId: newNest.id,
    metadata: {
      name: body.name,
      author: body.author,
      description: body.description || null,
    },
  });

  return {
    data: {
      id: newNest.id,
      uuid: newNest.uuid,
      author: newNest.author,
      name: newNest.name,
      description: newNest.description,
      createdAt: newNest.createdAt,
      updatedAt: newNest.updatedAt,
    },
  };
});
