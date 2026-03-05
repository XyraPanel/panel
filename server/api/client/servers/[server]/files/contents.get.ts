import {
  getWingsClientForServer,
  WingsConnectionError,
  WingsAuthError,
} from '#server/utils/wings-client';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.exe',
  '.bin',
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return BINARY_EXTENSIONS.has(ext);
}

function sanitizeFilePath(path: string): string {
  return path.replace(/\.\./g, '').replace(/\/+/g, '/');
}

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
    requiredPermissions: ['server.files.read'],
  });

  const query = await getValidatedQuery(
    event,
    z.object({
      file: z.string().optional(),
    }),
  );
  const fileParam = query.file ?? '';
  const file = sanitizeFilePath(fileParam);

  if (!file) {
    throw createError({
      status: 400,
      message: 'File path is required',
    });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);

    if (isBinaryFile(file)) {
      throw createError({
        status: 400,
        message: 'Cannot view binary file',
        data: { isBinary: true },
      });
    }

    const content = await client.getFileContents(server.uuid, file);

    if (content.length > MAX_FILE_SIZE) {
      throw createError({
        status: 413,
        message: 'File too large to view',
        data: { size: content.length, maxSize: MAX_FILE_SIZE },
      });
    }

    return {
      data: {
        content,
        file,
        size: content.length,
      },
    };
  } catch (error) {
    logger.error('Failed to read file from Wings:', error);

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

    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }

    throw createError({
      status: 500,
      message: 'Failed to read file',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
