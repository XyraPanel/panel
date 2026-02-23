import { eq, and } from 'drizzle-orm';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  const backupId = getRouterParam(event, 'backupId');

  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  if (!backupId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing backup identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.restore'],
  });

  const db = useDrizzle();

  const [backup] = await db
    .select()
    .from(tables.serverBackups)
    .where(and(eq(tables.serverBackups.id, backupId), eq(tables.serverBackups.serverId, server.id)))
    .limit(1);

  if (!backup) {
    throw createError({ status: 404, statusText: 'Backup not found' });
  }

  if (!server.nodeId) {
    throw createError({ status: 500, statusText: 'Server has no assigned node' });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.restoreBackup(server.uuid, backup.uuid);

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.backup.restore_requested',
      targetType: 'server',
      targetId: server.id,
      metadata: { backupId },
    });

    return {
      data: {
        success: true,
        message: 'Backup restore initiated successfully',
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to restore backup',
    });
  }
});
