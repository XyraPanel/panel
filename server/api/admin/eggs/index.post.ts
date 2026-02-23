import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { createEggSchema } from '#shared/schema/admin/eggs';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

  const body = await readValidatedBodyWithLimit(event, createEggSchema, BODY_SIZE_LIMITS.MEDIUM);

  const db = useDrizzle();
  const now = new Date();

  const newEgg = {
    id: randomUUID(),
    uuid: randomUUID(),
    nestId: body.nestId,
    author: body.author.trim(),
    name: body.name.trim(),
    description: body.description?.trim() || null,
    features: body.features ? JSON.stringify(body.features) : null,
    fileDenylist: body.fileDenylist ? JSON.stringify(body.fileDenylist) : null,
    updateUrl: body.updateUrl?.trim() || null,
    dockerImage: body.dockerImage.trim(),
    dockerImages: body.dockerImages ? JSON.stringify(body.dockerImages) : null,
    startup: body.startup.trim(),
    configFiles: body.configFiles ? JSON.stringify(body.configFiles) : null,
    configStartup: body.configStartup ? JSON.stringify(body.configStartup) : null,
    configStop: body.configStop ?? null,
    configLogs: body.configLogs ? JSON.stringify(body.configLogs) : null,
    scriptContainer: body.scriptContainer ?? null,
    scriptEntry: body.scriptEntry ?? null,
    scriptInstall: body.scriptInstall ?? null,
    copyScriptFrom: body.copyScriptFrom ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tables.eggs).values(newEgg);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.created',
    targetType: 'settings',
    targetId: newEgg.id,
    metadata: {
      eggName: newEgg.name,
      nestId: newEgg.nestId,
    },
  });

  return {
    data: {
      id: newEgg.id,
      uuid: newEgg.uuid,
      nestId: newEgg.nestId,
      author: newEgg.author,
      name: newEgg.name,
      description: newEgg.description,
      dockerImage: newEgg.dockerImage,
      dockerImages: body.dockerImages ?? null,
      startup: newEgg.startup,
      createdAt: newEgg.createdAt,
      updatedAt: newEgg.updatedAt,
    },
  };
});
