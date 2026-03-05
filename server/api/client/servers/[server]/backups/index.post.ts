import { backupManager } from '#server/utils/backup-manager';
import { logger } from '#server/utils/logger';
import { WingsConnectionError, WingsAuthError } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getServerWithAccess } from '#server/utils/server-helpers';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { z } from 'zod';

const createBackupSchema = z.object({
  name: z.string().trim().max(255).optional(),
  ignored: z.string().trim().max(2048).optional(),
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.backup.create'],
  });

  const { name, ignored } = await readValidatedBodyWithLimit(
    event,
    createBackupSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const backup = await backupManager.createBackup(server.uuid, {
      name,
      ignoredFiles: ignored,
      userId: accountContext.user.id,
    });

    const serializeDate = (value: Date | string | null | undefined) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value ?? null;
    };

    return {
      success: true,
      data: {
        id: backup.id,
        uuid: backup.uuid,
        name: backup.name,
        size: backup.size,
        isSuccessful: backup.isSuccessful,
        isLocked: backup.isLocked,
        checksum: backup.checksum,
        ignoredFiles: backup.ignoredFiles,
        completedAt: serializeDate(backup.completedAt),
        createdAt: serializeDate(backup.createdAt),
      },
    };
  } catch (error) {
    logger.error('Failed to create backup:', error);

    if (error instanceof WingsAuthError) {
      throw createError({
        status: 403,
        message: 'Wings authentication failed',
      });
    }

    if (error instanceof WingsConnectionError) {
      throw createError({
        status: 503,
        message: 'Wings daemon unavailable',
      });
    }

    throw createError({
      status: 500,
      message: 'Failed to create backup',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
