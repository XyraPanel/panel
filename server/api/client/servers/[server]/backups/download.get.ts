import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { decryptToken } from '#server/utils/wings/encryption';
import { generateBackupDownloadToken } from '#server/utils/wings-tokens';
import { requireAccountUser, getValidatedQuery } from '#server/utils/security';
import { z } from 'zod';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const { backup: backupUuid } = await getValidatedQuery(event, z.object({
    backup: z.string(),
  }));

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

  const downloadToken = await generateBackupDownloadToken(
    {
      serverUuid: server.uuid,
      backupUuid,
    },
    tokenSecret,
  );

  const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;
  const remoteUrl = `${baseUrl}/api/servers/${server.uuid}/backup/${backupUuid}/download?token=${downloadToken}`;

  const result = await $fetch.raw(remoteUrl, {
    responseType: 'stream',
    headers: {
      Authorization: `Bearer ${tokenSecret}`,
    },
  });

  const headers = result.headers;
  const contentType = headers.get('content-type') || 'application/octet-stream';
  const contentLength = headers.get('content-length');
  const contentDisposition =
    headers.get('content-disposition') || `attachment; filename="backup-${backupUuid}.tar.gz"`;

  setHeaders(event, {
    'Content-Type': contentType,
    'Content-Disposition': contentDisposition,
    ...(contentLength && { 'Content-Length': contentLength }),
  });

  return result.body;
});
