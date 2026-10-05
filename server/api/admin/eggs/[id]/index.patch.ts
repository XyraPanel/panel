import { eq } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { updateEggSchema } from '#shared/schema/admin/infrastructure';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Eggs'],
    summary: 'Update an egg',
    description:
      'Partially updates an egg\'s configuration. Requires an admin session with the eggs:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              nestId: { type: 'string', format: 'uuid' },
              name: { type: 'string', maxLength: 255 },
              description: { type: 'string' },
              features: { type: 'array', items: { type: 'string' } },
              fileDenylist: { type: 'array', items: { type: 'string' } },
              forceOutgoingIp: { type: 'boolean' },
              updateUrl: { type: 'string' },
              dockerImage: { type: 'string' },
              dockerImages: { type: 'array', items: { type: 'string' } },
              startup: { type: 'string' },
              configFiles: { type: 'string', description: 'JSON string' },
              configStartup: { type: 'string', description: 'JSON string' },
              configStop: { type: 'string' },
              configLogs: { type: 'string', description: 'JSON string' },
              scriptContainer: { type: 'string' },
              scriptEntry: { type: 'string' },
              scriptInstall: { type: 'string' },
              copyScriptFrom: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Egg updated' },
      '400': { description: 'Egg ID is required, or no fields provided to update' },
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

  const body = await readValidatedBodyWithLimit(event, updateEggSchema, BODY_SIZE_LIMITS.MEDIUM);

  if (Object.keys(body).length === 0) {
    throw createError({
      status: 400,
      message: 'No fields provided to update',
    });
  }

  try {
    const db = useDrizzle();

    const [egg] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).limit(1);

    if (!egg) {
      throw createError({ status: 404, message: 'Egg not found' });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.nestId) updates.nestId = body.nestId;
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description ?? null;
    if (body.features !== undefined)
      updates.features = body.features ? JSON.stringify(body.features) : null;
    if (body.fileDenylist !== undefined)
      updates.fileDenylist = body.fileDenylist ? JSON.stringify(body.fileDenylist) : null;
    if (body.forceOutgoingIp !== undefined) updates.forceOutgoingIp = body.forceOutgoingIp;
    if (body.updateUrl !== undefined) updates.updateUrl = body.updateUrl ?? null;
    if (body.dockerImage !== undefined) updates.dockerImage = body.dockerImage;
    if (body.dockerImages !== undefined) {
      updates.dockerImages = body.dockerImages ? JSON.stringify(body.dockerImages) : null;
    }
    if (body.startup !== undefined) updates.startup = body.startup;
    if (body.configFiles !== undefined)
      updates.configFiles = body.configFiles ? JSON.stringify(body.configFiles) : null;
    if (body.configStartup !== undefined)
      updates.configStartup = body.configStartup ? JSON.stringify(body.configStartup) : null;
    if (body.configStop !== undefined) updates.configStop = body.configStop ?? null;
    if (body.configLogs !== undefined)
      updates.configLogs = body.configLogs ? JSON.stringify(body.configLogs) : null;
    if (body.scriptContainer !== undefined) updates.scriptContainer = body.scriptContainer ?? null;
    if (body.scriptEntry !== undefined) updates.scriptEntry = body.scriptEntry ?? null;
    if (body.scriptInstall !== undefined) updates.scriptInstall = body.scriptInstall ?? null;
    if (body.copyScriptFrom !== undefined) updates.copyScriptFrom = body.copyScriptFrom ?? null;

    await db.update(tables.eggs).set(updates).where(eq(tables.eggs.id, eggId));

    const [updatedEgg] = await db
      .select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, eggId))
      .limit(1);

    if (!updatedEgg) {
      throw createError({
        status: 404,
        message: 'Egg not found after update',
      });
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.egg.updated',
      targetType: 'settings',
      targetId: eggId,
      metadata: {
        eggName: updatedEgg.name,
        updatedFields: Object.keys(body),
      },
    });

    return {
      data: {
        id: updatedEgg.id,
        uuid: updatedEgg.uuid,
        nestId: updatedEgg.nestId,
        author: updatedEgg.author,
        name: updatedEgg.name,
        description: updatedEgg.description,
        dockerImage: updatedEgg.dockerImage,
        dockerImages: updatedEgg.dockerImages ? JSON.parse(updatedEgg.dockerImages) : null,
        startup: updatedEgg.startup,
        configFiles: updatedEgg.configFiles ? JSON.parse(updatedEgg.configFiles) : null,
        configStartup: updatedEgg.configStartup ? JSON.parse(updatedEgg.configStartup) : null,
        configLogs: updatedEgg.configLogs ? JSON.parse(updatedEgg.configLogs) : null,
        configStop: updatedEgg.configStop,
        updatedAt: new Date(updatedEgg.updatedAt).toISOString(),
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Egg Patch] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to update egg',
    });
  }
});
