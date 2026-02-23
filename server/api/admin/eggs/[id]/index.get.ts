import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { EggWithVariables } from '#shared/types/admin';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.READ);

  const eggId = getRouterParam(event, 'id');
  if (!eggId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Egg ID is required' });
  }

  const db = useDrizzle();

  const [egg] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).limit(1);

  if (!egg) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Egg not found' });
  }

  const variables = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.eggId, eggId))
    .orderBy(tables.eggVariables.name);

  const data: EggWithVariables = {
    id: egg.id,
    uuid: egg.uuid,
    nestId: egg.nestId,
    author: egg.author,
    name: egg.name,
    description: egg.description,
    features: egg.features ? JSON.parse(egg.features) : null,
    fileDenylist: egg.fileDenylist ? JSON.parse(egg.fileDenylist) : null,
    updateUrl: egg.updateUrl,
    dockerImage: egg.dockerImage,
    dockerImages: egg.dockerImages ? JSON.parse(egg.dockerImages) : null,
    startup: egg.startup,
    configFiles: egg.configFiles ? JSON.parse(egg.configFiles) : null,
    configStartup: egg.configStartup ? JSON.parse(egg.configStartup) : null,
    configStop: egg.configStop,
    configLogs: egg.configLogs ? JSON.parse(egg.configLogs) : null,
    scriptContainer: egg.scriptContainer,
    scriptEntry: egg.scriptEntry,
    scriptInstall: egg.scriptInstall,
    copyScriptFrom: egg.copyScriptFrom,
    createdAt: new Date(egg.createdAt).toISOString(),
    updatedAt: new Date(egg.updatedAt).toISOString(),
    variables: variables.map((v) => ({
      id: v.id,
      eggId: v.eggId,
      name: v.name,
      description: v.description,
      envVariable: v.envVariable,
      defaultValue: v.defaultValue,
      userViewable: Boolean(v.userViewable),
      userEditable: Boolean(v.userEditable),
      rules: v.rules,
      createdAt: new Date(v.createdAt).toISOString(),
      updatedAt: new Date(v.updatedAt).toISOString(),
    })),
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.viewed',
    targetType: 'settings',
    targetId: eggId,
    metadata: {
      eggName: egg.name,
      variableCount: data.variables.length,
    },
  });

  return { data };
});
