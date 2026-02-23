import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({ status: 400, message: 'Server ID is required' });
  }

  const db = useDrizzle();
  const { findServerByIdentifier } = await import('#server/utils/serversStore');
  const server = await findServerByIdentifier(identifier);

  if (!server) {
    throw createError({ status: 404, message: 'Server not found' });
  }

  const [egg] = server.eggId
    ? await db.select().from(tables.eggs).where(eq(tables.eggs.id, server.eggId)).limit(1)
    : [];

  const envRows = await db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, server.id));

  const environment: Record<string, string> = {};
  for (const row of envRows) {
    environment[row.key] = row.value ?? '';
  }

  const dockerImages: Record<string, string> = egg?.dockerImages
    ? (() => {
        try {
          return JSON.parse(egg.dockerImages);
        } catch {
          return {};
        }
      })()
    : {};

  return {
    data: {
      startup: server.startup || egg?.startup || '',
      dockerImage: server.dockerImage || server.image || egg?.dockerImage || '',
      dockerImages,
      environment,
      egg: egg ? { id: egg.id, name: egg.name, startup: egg.startup } : null,
    },
  };
});
