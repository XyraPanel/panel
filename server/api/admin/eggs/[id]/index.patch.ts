import { eq } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { updateEggSchema } from '#shared/schema/admin/infrastructure';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

  const eggId = getRouterParam(event, 'id');
  if (!eggId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Egg ID is required' });
  }

  const body = await readValidatedBodyWithLimit(event, updateEggSchema, BODY_SIZE_LIMITS.MEDIUM);

  if (Object.keys(body).length === 0) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'No fields provided to update',
    });
  }

  const db = useDrizzle();

  const [egg] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).limit(1);

  if (!egg) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Egg not found' });
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.nestId) updates.nestId = body.nestId;
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description ?? null;
  if (body.features !== undefined)
    updates.features = body.features ? JSON.stringify(body.features) : null;
  if (body.fileDenylist !== undefined)
    updates.fileDenylist = body.fileDenylist ? JSON.stringify(body.fileDenylist) : null;
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
      statusText: 'Not Found',
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
});
