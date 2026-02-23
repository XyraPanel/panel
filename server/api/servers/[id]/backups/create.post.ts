import { randomUUID } from 'node:crypto';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.create'],
  });

  if (!server.nodeId) {
    throw createError({ status: 500, statusText: 'Server has no assigned node' });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    const backupUuid = randomUUID();
    await client.createBackup(server.uuid, backupUuid);

    const db = useDrizzle();
    const backupId = randomUUID();
    await db.insert(tables.serverBackups).values({
      id: backupId,
      serverId: server.id,
      uuid: backupUuid,
      name: `Backup ${new Date().toISOString()}`,
      ignoredFiles: JSON.stringify([]),
      disk: 'wings',
      checksum: null,
      bytes: 0,
      isSuccessful: false,
      isLocked: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.backup.created',
      targetType: 'server',
      targetId: server.id,
      metadata: { backupId, backupUuid },
    });

    return {
      data: {
        uuid: backupUuid,
        id: backupId,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to create backup',
    });
  }
});
