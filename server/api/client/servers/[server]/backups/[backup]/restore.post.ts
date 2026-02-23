import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';
import { z } from 'zod';

const restoreBackupSchema = z.object({
  truncate: z.boolean().optional().default(false),
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
    requiredPermissions: ['server.backup.restore'],
  });

  const rawBody = await readBody(event);
  const { truncate } = restoreBackupSchema.parse(rawBody ?? {});

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

  let wasRunning = false;
  try {
    const { client } = await getWingsClientForServer(server.uuid);

    const serverDetails = await client.getServerDetails(server.uuid);
    wasRunning = serverDetails.state === 'running';

    if (wasRunning) {
      console.log(`[Backup Restore] Stopping server ${server.uuid} before restore`);
      await client.sendPowerAction(server.uuid, 'stop');

      const maxWaitTime = 30000; // 30 seconds
      const startTime = Date.now();
      let stopped = false;

      while (!stopped && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const details = await client.getServerDetails(server.uuid);
        if (details.state === 'offline') {
          stopped = true;
        }
      }

      if (!stopped) {
        console.warn(
          `[Backup Restore] Server ${server.uuid} did not stop within timeout, proceeding with restore anyway`,
        );
      }
    }

    await client.restoreBackup(server.uuid, backup.uuid, truncate);

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.email || accountContext.user.id,
      actorType: 'user',
      action: 'server.backup.restored',
      targetType: 'backup',
      targetId: backupUuid,
      metadata: {
        serverId: server.id,
        backupName: backup?.name,
        truncate,
        wasRunning,
      },
    });

    return {
      success: true,
      message: 'Backup restore initiated',
      wasRunning,
    };
  } catch (error) {
    console.error('Failed to restore backup on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to restore backup',
    });
  }
});
