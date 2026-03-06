import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { decryptToken } from '#server/utils/wings/encryption';
import { generateBackupDownloadToken } from '#server/utils/wings-tokens';
import { requireAccountUser, getValidatedQuery } from '#server/utils/security';
import { z } from 'zod';

defineRouteMeta({
  openAPI: {
    tags: ['Server Backups'],
    summary: 'Download a server backup',
    description: 'Streams a server backup file directly from the node to the client.',
    parameters: [
      {
        in: 'path',
        name: 'server',
        required: true,
        schema: { type: 'string' },
        description: 'Server internal ID or UUID',
      },
      {
        in: 'query',
        name: 'backup',
        required: true,
        schema: { type: 'string' },
        description: 'The UUID of the backup to download',
      },
    ],
    responses: {
      200: {
        description: 'Streaming backup file content',
        content: {
          'application/octet-stream': {
            schema: { type: 'string', format: 'binary' },
          },
        },
      },
      400: { description: 'Missing server or backup identifiers' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.backup.download permission' },
      404: { description: 'Backup not found' },
    },
  },
});

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
