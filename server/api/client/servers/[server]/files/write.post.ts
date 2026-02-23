import {
  getWingsClientForServer,
  WingsConnectionError,
  WingsAuthError,
} from '#server/utils/wings-client';
import { recordAuditEvent } from '#server/utils/audit';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getServerWithAccess } from '#server/utils/server-helpers';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { writeFileSchema } from '#shared/schema/server/operations';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function sanitizeFilePath(path: string): string {
  return path.replace(/\.\./g, '').replace(/\/+/g, '/');
}

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.write'],
  });

  const body = await readValidatedBodyWithLimit(event, writeFileSchema, BODY_SIZE_LIMITS.LARGE);
  const rawFile = body.file || body.path || '';
  const content = body.content ?? body.contents ?? '';
  const file = sanitizeFilePath(rawFile);

  if (!file) {
    throw createError({
      status: 400,
      statusText: 'File path is required',
    });
  }

  const contentSize = Buffer.byteLength(content, 'utf8');
  if (contentSize > MAX_FILE_SIZE) {
    throw createError({
      status: 413,
      statusText: 'File content too large',
      data: { size: contentSize, maxSize: MAX_FILE_SIZE },
    });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);

    let hadExistingFile = false;
    try {
      await client.getFileContents(server.uuid as string, file);
      hadExistingFile = true;
    } catch {
      // File doesn't exist, will be created
    }

    await client.writeFileContents(server.uuid as string, file, content);

    await recordAuditEvent({
      actor: accountContext.user.id,
      actorType: 'user',
      action: hadExistingFile ? 'server.file.edit' : 'server.file.create',
      targetType: 'server',
      targetId: server.id as string,
      metadata: {
        file,
        size: contentSize,
        hadBackup: hadExistingFile,
      },
    });

    return {
      success: true,
      message: `File ${hadExistingFile ? 'updated' : 'created'} successfully`,
      data: {
        file,
        size: contentSize,
        hadBackup: hadExistingFile,
      },
    };
  } catch (error) {
    if (error instanceof WingsAuthError) {
      throw createError({
        status: 403,
        statusText: 'Wings authentication failed',
      });
    }

    if (error instanceof WingsConnectionError) {
      throw createError({
        status: 503,
        statusText: 'Wings daemon unavailable',
      });
    }

    throw createError({
      status: 500,
      statusText: 'Failed to write file',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
