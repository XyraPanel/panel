import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Nests'],
    summary: 'Delete a nest',
    description:
      'Deletes a nest. Fails if any eggs still belong to it. Requires an admin session with the nests:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Nest deleted' },
      '400': { description: 'Nest ID is required, or eggs still belong to this nest' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing nests:write ACL permission' },
      '404': { description: 'Nest not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.WRITE);

  const nestId = getRouterParam(event, 'id');
  if (!nestId) {
    throw createError({ status: 400, message: 'Nest ID is required' });
  }

  try {
    const db = useDrizzle();

    const [existing] = await db
      .select()
      .from(tables.nests)
      .where(eq(tables.nests.id, nestId))
      .limit(1);

    if (!existing) {
      throw createError({ status: 404, message: 'Nest not found' });
    }

    const eggsCount = await db
      .select({ id: tables.eggs.id })
      .from(tables.eggs)
      .where(eq(tables.eggs.nestId, nestId));

    if (eggsCount.length > 0) {
      throw createError({
        status: 400,
        message: `Cannot delete nest with ${eggsCount.length} egg(s). Delete associated eggs first.`,
      });
    }

    await db.delete(tables.nests).where(eq(tables.nests.id, nestId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.nest.deleted',
      targetType: 'settings',
      targetId: nestId,
      metadata: {
        name: existing.name,
        author: existing.author,
      },
    });

    return {
      data: {
        success: true,
        deletedId: nestId,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Nest Delete] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete nest',
    });
  }
});
