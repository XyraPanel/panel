import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { invalidateServerBackupsCache } from '#server/utils/backups';
import { remoteBackupStatusSchema } from '#shared/schema/wings';
import { sendBackupCompletedEmail } from '#server/utils/email';

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle();
  const { backupId } = event.context.params ?? {};

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing backup ID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const { checksum, checksum_type, size, successful, parts } = await readValidatedBodyWithLimit(
    event,
    remoteBackupStatusSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const backupRows = await db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupId))
    .limit(1);

  const backup = backupRows[0];

  if (!backup) {
    throw createError({ status: 404, statusText: 'Backup not found' });
  }

  const updates = {
    checksum: successful ? `${checksum_type}:${checksum}` : null,
    bytes: successful ? size : 0,
    completedAt: new Date().toISOString(),
    isSuccessful: successful,
    isLocked: successful ? backup.isLocked : false,
    updatedAt: new Date().toISOString(),
  };

  await db.update(tables.serverBackups).set(updates).where(eq(tables.serverBackups.id, backup.id));

  await invalidateServerBackupsCache(backup.serverId);

  const serverRows = await db
    .select({
      id: tables.servers.id,
      uuid: tables.servers.uuid,
      name: tables.servers.name,
      ownerId: tables.servers.ownerId,
    })
    .from(tables.servers)
    .where(eq(tables.servers.id, backup.serverId))
    .limit(1);

  const server = serverRows[0];

  if (successful && server?.ownerId) {
    try {
      const ownerRows = await db
        .select({ email: tables.users.email, username: tables.users.username })
        .from(tables.users)
        .where(eq(tables.users.id, server.ownerId))
        .limit(1);
      const owner = ownerRows[0];
      if (owner?.email) {
        await sendBackupCompletedEmail(owner.email, server.name as string, backup.name);
      }
    } catch {
      // Non-fatal — don't fail the callback if email sending fails
    }
  }

  await recordAuditEventFromRequest(event, {
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server:backup.complete' : 'server:backup.fail',
    targetType: 'backup',
    targetId: backupId,
    metadata: {
      node_id: nodeId,
      server_uuid: server?.uuid,
      checksum: successful ? `${checksum_type}:${checksum}` : undefined,
      size: successful ? size : 0,
      successful,
      parts: parts?.length || 0,
    },
  });

  return {
    data: {
      success: true,
    },
  };
});
