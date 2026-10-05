import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Mounts'],
    summary: 'Delete a mount',
    description:
      'Deletes a mount point. Requires an admin session with the mounts:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Mount deleted' },
      '400': { description: 'Mount ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing mounts:write ACL permission' },
      '404': { description: 'Mount not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.MOUNTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const mountId = getRouterParam(event, 'id');
  if (!mountId) {
    throw createError({ status: 400, message: 'Mount ID is required' });
  }

  try {
    const db = useDrizzle();

    const [existing] = await db
      .select()
      .from(tables.mounts)
      .where(eq(tables.mounts.id, mountId))
      .limit(1);

    if (!existing) {
      throw createError({ status: 404, message: 'Mount not found' });
    }

    await db.delete(tables.mounts).where(eq(tables.mounts.id, mountId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.mount.deleted',
      targetType: 'settings',
      targetId: mountId,
      metadata: {
        mountName: existing.name,
        source: existing.source,
        target: existing.target,
      },
    });

    return {
      data: {
        success: true,
        deletedId: mountId,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Mount Delete] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete mount',
    });
  }
});
