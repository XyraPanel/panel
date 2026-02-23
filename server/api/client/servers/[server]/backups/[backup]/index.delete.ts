import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer, WingsConnectionError } from '#server/utils/wings-client';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { invalidateServerBackupsCache } from '#server/utils/backups';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
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
    requiredPermissions: ['server.backup.delete'],
  });

  const db = useDrizzle();
  const [backup] = await db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupUuid))
    .limit(1);

  if (!backup || backup.serverId !== server.id) {
    throw createError({
      status: 404,
      message: 'Backup not found',
    });
  }

  if (backup.isLocked) {
    throw createError({
      status: 403,
      message: 'Cannot delete locked backup',
    });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    try {
      await client.deleteBackup(server.uuid, backupUuid);
    } catch (error) {
      if (error instanceof WingsConnectionError && error.message.includes('404')) {
        // Backup missing on Wings, continue with local deletion
      } else {
        throw error;
      }
    }

    await db.delete(tables.serverBackups).where(eq(tables.serverBackups.uuid, backupUuid));

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.email || accountContext.user.id,
      actorType: 'user',
      action: 'server.backup.deleted',
      targetType: 'backup',
      targetId: backupUuid,
      metadata: {
        serverId: server.id,
        backupName: backup?.name,
      },
    });

    await invalidateServerBackupsCache(server.id as string);

    return {
      success: true,
      message: 'Backup deleted successfully',
    };
  } catch {
    throw createError({
      status: 500,
      message: 'Failed to delete backup',
    });
  }
});
