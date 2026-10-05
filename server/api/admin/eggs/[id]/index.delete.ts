import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Eggs'],
    summary: 'Delete an egg',
    description:
      'Deletes an egg. Fails if any servers are still assigned to it. Requires an admin session with the eggs:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Egg deleted' },
      '400': { description: 'Egg ID is required, or servers are still assigned to this egg' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing eggs:write ACL permission' },
      '404': { description: 'Egg not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
    const session = await requireAdmin(event);

    await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

    const eggId = getRouterParam(event, 'id');
    if (!eggId) {
      throw createError({ status: 400, message: 'Egg ID is required' });
    }

    const db = useDrizzle();

    const [existing] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).limit(1);

    if (!existing) {
      throw createError({ status: 404, message: 'Egg not found' });
    }

    const servers = await db
      .select({ id: tables.servers.id })
      .from(tables.servers)
      .where(eq(tables.servers.eggId, eggId));

    if (servers.length > 0) {
      throw createError({
        status: 400,
        message: `Cannot delete egg with ${servers.length} assigned server(s)`,
      });
    }

    await db.delete(tables.eggs).where(eq(tables.eggs.id, eggId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.egg.deleted',
      targetType: 'settings',
      targetId: eggId,
      metadata: {
        eggName: existing.name,
        nestId: existing.nestId,
      },
    });

    return {
      data: {
        success: true,
        deletedId: eggId,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
