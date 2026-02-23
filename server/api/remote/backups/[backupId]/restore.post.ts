import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { BODY_SIZE_LIMITS, readValidatedBodyWithLimit } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { remoteBackupRestoreStatusSchema } from '#shared/schema/wings';

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle();
  const { backupId } = event.context.params ?? {};

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing backup ID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const body = await readValidatedBodyWithLimit(
    event,
    remoteBackupRestoreStatusSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const { successful } = body;

  const backupRows = await db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupId))
    .limit(1);

  const backup = backupRows[0];

  if (!backup) {
    throw createError({ status: 404, statusText: 'Backup not found' });
  }

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, backup.serverId))
    .limit(1);

  const server = serverRows[0];

  if (server) {
    await db
      .update(tables.servers)
      .set({
        status: successful ? null : 'restore_failed',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.servers.id, server.id));
  }

  await recordAuditEventFromRequest(event, {
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server:backup.restore-complete' : 'server:backup.restore-failed',
    targetType: 'backup',
    targetId: backupId,
    metadata: {
      node_id: nodeId,
      server_uuid: server?.uuid,
      successful,
    },
  });

  return {
    data: {
      success: true,
    },
  };
});
