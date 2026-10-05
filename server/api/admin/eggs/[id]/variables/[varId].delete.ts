import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Eggs'],
    summary: 'Delete an egg variable',
    description:
      'Deletes a single variable definition from an egg. Requires an admin session with the eggs:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'varId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Variable deleted' },
      '400': { description: 'Egg ID and variable ID are required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing eggs:write ACL permission' },
      '404': { description: 'Variable not found, or does not belong to this egg' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

  const eggId = getRouterParam(event, 'id');
  const varId = getRouterParam(event, 'varId');

  if (!eggId || !varId) {
    throw createError({ status: 400, message: 'IDs are required' });
  }

  try {
    const db = useDrizzle();

    const [existing] = await db
      .select()
      .from(tables.eggVariables)
      .where(eq(tables.eggVariables.id, varId))
      .limit(1);

    if (!existing || existing.eggId !== eggId) {
      throw createError({ status: 404, message: 'Variable not found' });
    }

    await db.delete(tables.eggVariables).where(eq(tables.eggVariables.id, varId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.egg.variable.deleted',
      targetType: 'settings',
      targetId: eggId,
      metadata: {
        variableId: varId,
        variableName: existing.name,
        envVariable: existing.envVariable,
      },
    });

    return {
      data: {
        success: true,
        deletedId: varId,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Egg Variable Delete] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete egg variable',
    });
  }
});
