import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { decryptToken } from '#server/utils/wings/encryption';
import { generateBackupDownloadToken } from '../../../../../../../server/utils/wings-tokens';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const backupUuid = getRouterParam(event, 'backup');

  if (!serverId || !backupUuid) {
    throw createError({
      status: 400,
      message: 'Server and backup identifiers are required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.download'],
  });

  const db = useDrizzle();
  const [backup] = await db
    .select()
    .from(tables.serverBackups)
    .where(
      and(eq(tables.serverBackups.uuid, backupUuid), eq(tables.serverBackups.serverId, server.id)),
    )
    .limit(1);

  if (!backup) {
    throw createError({
      status: 404,
      message: 'Backup not found',
    });
  }

  if (!server.nodeId) {
    throw createError({
      status: 500,
      message: 'Server is not assigned to a Wings node',
    });
  }

  const [node] = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId))
    .limit(1);

  if (!node) {
    throw createError({
      status: 500,
      message: 'Wings node not found',
    });
  }

  const tokenSecret = decryptToken(node.tokenSecret);

  if (!server.uuid) {
    throw createError({
      status: 500,
      message: 'Server UUID is missing',
    });
  }

  const downloadToken = await generateBackupDownloadToken(
    {
      serverUuid: server.uuid,
      backupUuid,
    },
    tokenSecret,
  );

  const downloadUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}/download/backup?token=${downloadToken}`;

  return {
    attributes: {
      url: downloadUrl,
    },
  };
});
