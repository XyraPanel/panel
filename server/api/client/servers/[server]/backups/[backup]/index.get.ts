import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Backups'],
    summary: 'Get backup details',
    description:
      'Returns details for a single backup. Requires the server.backup.download permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID or identifier' },
      { name: 'backup', in: 'path', required: true, schema: { type: 'string' }, description: 'Backup UUID' },
    ],
    responses: {
      '200': {
        description: 'Backup details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                object: { type: 'string', enum: ['backup'] },
                attributes: {
                  type: 'object',
                  properties: {
                    uuid: { type: 'string' },
                    name: { type: 'string' },
                    ignored_files: { type: 'array', items: { type: 'string' } },
                    sha256_hash: { type: 'string', nullable: true },
                    bytes: { type: 'integer', nullable: true },
                    created_at: { type: 'string' },
                    completed_at: { type: 'string', nullable: true },
                    is_successful: { type: 'boolean' },
                    is_locked: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing server or backup identifier' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.backup.download permission' },
      '404': { description: 'Server or backup not found' },
    },
  },
});

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
      and(eq(tables.serverBackups.serverId, server.id), eq(tables.serverBackups.uuid, backupUuid)),
    )
    .limit(1);

  if (!backup) {
    throw createError({
      status: 404,
      message: 'Backup not found',
    });
  }

  return {
    object: 'backup',
    attributes: {
      uuid: backup.uuid,
      name: backup.name,
      ignored_files: backup.ignoredFiles ? JSON.parse(backup.ignoredFiles) : [],
      sha256_hash: backup.checksum,
      bytes: backup.bytes,
      created_at: backup.createdAt,
      completed_at: backup.completedAt,
      is_successful: backup.isSuccessful,
      is_locked: backup.isLocked,
    },
  };
});
