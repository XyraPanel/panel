import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.READ);

  const eggId = getRouterParam(event, 'id');

  if (!eggId) {
    throw createError({ status: 400, statusText: 'Egg ID is required' });
  }

  const db = useDrizzle();

  const [egg] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).limit(1);

  if (!egg) {
    throw createError({ status: 404, statusText: 'Egg not found' });
  }

  const variables = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.eggId, eggId));

  const exportData = {
    _comment: 'DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY XYRAPANEL',
    meta: {
      version: 'PTDL_v2',
      update_url: null,
    },
    exported_at: new Date().toISOString(),
    name: egg.name,
    author: egg.author || 'unknown@unknown.com',
    description: egg.description || '',
    features: null,
    docker_images: egg.dockerImages
      ? JSON.parse(egg.dockerImages)
      : { [egg.dockerImage]: egg.dockerImage },
    file_denylist: [],
    startup: egg.startup || '',
    config: {
      files: egg.configFiles ? JSON.parse(egg.configFiles) : {},
      startup: egg.configStartup
        ? JSON.parse(egg.configStartup)
        : {
            done: 'Server started',
            userInteraction: [],
          },
      logs: egg.configLogs ? JSON.parse(egg.configLogs) : {},
      stop: egg.configStop || 'stop',
    },
    scripts: {
      installation: {
        script: egg.scriptInstall || '',
        container: egg.scriptContainer || 'alpine:3.4',
        entrypoint: egg.scriptEntry || 'ash',
      },
    },
    variables: variables.map((v: typeof tables.eggVariables.$inferSelect) => ({
      name: v.name,
      description: v.description || '',
      env_variable: v.envVariable,
      default_value: v.defaultValue || '',
      user_viewable: Boolean(v.userViewable),
      user_editable: Boolean(v.userEditable),
      rules: v.rules || 'required|string',
      field_type: 'text',
    })),
  };

  const filename = egg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  setResponseHeaders(event, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="egg-${filename}.json"`,
  });

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.exported',
    targetType: 'settings',
    targetId: eggId,
    metadata: {
      eggName: egg.name,
      variableCount: variables.length,
    },
  });

  return exportData;
});
