import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { createEggVariableSchema } from '#shared/schema/admin/infrastructure';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Eggs'],
    summary: 'Create an egg variable',
    description:
      'Adds a new startup/environment variable definition to an egg. Requires an admin session with the eggs:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'envVariable', 'defaultValue'],
            properties: {
              name: { type: 'string', maxLength: 255 },
              description: { type: 'string' },
              envVariable: { type: 'string', maxLength: 255 },
              defaultValue: { type: 'string' },
              userViewable: { type: 'boolean', default: true },
              userEditable: { type: 'boolean', default: true },
              rules: { type: 'string', description: 'Pterodactyl validation rule string' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Variable created' },
      '400': { description: 'Egg ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing eggs:write ACL permission' },
      '404': { description: 'Egg not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

  const eggId = getRouterParam(event, 'id');
  if (!eggId) {
    throw createError({ status: 400, message: 'Egg ID is required' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    createEggVariableSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const db = useDrizzle();

    const [egg] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).limit(1);
    if (!egg) {
      throw createError({ status: 404, message: 'Egg not found' });
    }

    const now = new Date().toISOString();

    const newVariable = {
      id: randomUUID(),
      eggId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      envVariable: body.envVariable.trim(),
      defaultValue: body.defaultValue?.trim() || null,
      userViewable: body.userViewable ?? true,
      userEditable: body.userEditable ?? true,
      rules: body.rules?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tables.eggVariables).values(newVariable);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.egg.variable.created',
      targetType: 'settings',
      targetId: eggId,
      metadata: {
        variableId: newVariable.id,
        variableName: newVariable.name,
        envVariable: newVariable.envVariable,
      },
    });

    return {
      data: {
        id: newVariable.id,
        eggId: newVariable.eggId,
        name: newVariable.name,
        description: newVariable.description,
        envVariable: newVariable.envVariable,
        defaultValue: newVariable.defaultValue,
        userViewable: newVariable.userViewable,
        userEditable: newVariable.userEditable,
        rules: newVariable.rules,
        createdAt: newVariable.createdAt,
        updatedAt: newVariable.updatedAt,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Egg Variable Create] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to create egg variable',
    });
  }
});
