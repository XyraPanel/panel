import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
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

  await invalidateServerBackupsCache(server.id as string);

  return {
    object: 'backup',
    attributes: {
      uuid: backup.uuid,
      name: backup.name,
      is_locked: newLockStatus,
    },
  };
});
