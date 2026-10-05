import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { generateWingsJWT } from '#server/utils/wings/jwt';
import { requireAccountUser, getValidatedQuery } from '#server/utils/security';
import { z } from 'zod';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Backups'],
    summary: 'Download a backup',
    description:
      'Streams the backup archive directly from Wings, proxying the response. Requires the server.backup.download permission. A short-lived Wings JWT authorizes the underlying fetch.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID or identifier' },
      { name: 'backup', in: 'query', required: true, schema: { type: 'string' }, description: 'Backup UUID' },
    ],
    responses: {
      '200': {
        description: 'Backup archive stream',
        content: {
          'application/octet-stream': {
            schema: { type: 'string', format: 'binary' },
          },
        },
      },
      '400': { description: 'Missing server or backup identifier' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.backup.download permission' },
      '404': { description: 'Server or backup not found' },
      '500': { description: 'Server has no assigned Wings node, or node not found' },
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

  const downloadToken = await generateWingsJWT(
    {
      tokenSecret: node.tokenSecret,
      baseUrl: `${node.scheme}://${node.fqdn}:${node.daemonListen}`,
    },
    {
      user: { id: accountContext.user.id, uuid: accountContext.user.id },
      server: { uuid: server.uuid },
      expiresIn: 900,
      scope: 'backup-download',
      extraClaims: { backup_uuid: backupUuid },
    },
  );

  const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`;
  const remoteUrl = `${baseUrl}/download/backup?token=${downloadToken}`;

  const result = await $fetch.raw(remoteUrl, {
    responseType: 'stream',
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
