import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { user, session } = await requireAccountUser(event);

  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  });

  const db = useDrizzle();

  let egg = null;
  if (server.eggId) {
    const eggRows = await db
      .select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, server.eggId))
      .limit(1);
    egg = eggRows[0] ?? null;
  }

  let dockerImages: Record<string, string> = {};
  if (egg?.dockerImages) {
    try {
      dockerImages =
        typeof egg.dockerImages === 'string' ? JSON.parse(egg.dockerImages) : egg.dockerImages;
    } catch (error) {
      console.warn('[Startup GET] Failed to parse docker images:', error);
    }
  }

  if (Object.keys(dockerImages).length === 0 && egg?.dockerImage) {
    dockerImages = { [egg.name || 'Default']: egg.dockerImage };
  }

  const envRows = await db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, server.id));

  const serverEnvMap = new Map<string, string>();
  for (const envRow of envRows) {
    serverEnvMap.set(envRow.key, envRow.value || '');
  }

  const environment: Record<string, string> = {};

  if (egg?.id) {
    const eggVariables = await db
      .select()
      .from(tables.eggVariables)
      .where(eq(tables.eggVariables.eggId, egg.id));

    for (const eggVar of eggVariables) {
      const value = serverEnvMap.get(eggVar.envVariable) ?? eggVar.defaultValue ?? '';
      environment[eggVar.envVariable] = value;
    }
  }

  for (const [key, value] of serverEnvMap.entries()) {
    if (!(key in environment)) {
      environment[key] = value;
    }
  }

  const response = {
    data: {
      startup: server.startup || egg?.startup || '',
      dockerImage: server.dockerImage || server.image || egg?.dockerImage || '',
      dockerImages,
      environment,
    },
  };

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'server.startup.viewed',
    targetType: 'server',
    targetId: server.id,
  });

  return response;
});
