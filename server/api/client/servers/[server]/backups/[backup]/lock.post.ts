import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerBackupsCache } from '#server/utils/backups';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Backups'],
    summary: 'Toggle backup lock',
    description:
      'Toggles the locked state of a backup; locked backups cannot be deleted. Requires the server.backup.delete permission (locking gates deletion, so it shares that permission).',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID or identifier' },
      { name: 'backup', in: 'path', required: true, schema: { type: 'string' }, description: 'Backup UUID' },
    ],
    responses: {
      '200': {
        description: 'Lock state toggled',
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
      '403': { description: 'Missing server.backup.delete permission' },
      '404': { description: 'Server or backup not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
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

  // Locking/unlocking gates deletion (see index.delete.ts), so it must require the
  // same delete permission — a download-only subuser shouldn't be able to unlock (or
  // lock) backups the owner protected.
  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.delete'],
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

  const newLockStatus = !backup.isLocked;

  await db
    .update(tables.serverBackups)
    .set({ isLocked: !backup.isLocked })
    .where(eq(tables.serverBackups.uuid, backupUuid));

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.email || accountContext.user.id,
    actorType: 'user',
    action: backup.isLocked ? 'server.backup.unlocked' : 'server.backup.locked',
    targetType: 'backup',
    targetId: backupUuid,
    metadata: {
      serverId: server.id,
      backupName: backup?.name,
      isLocked: !backup.isLocked,
    },
  });

  await invalidateServerBackupsCache(server.id);

  return {
    object: 'backup',
    attributes: {
      uuid: backup.uuid,
      name: backup.name,
      is_locked: newLockStatus,
    },
  };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
