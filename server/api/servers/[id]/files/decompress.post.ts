import { remoteDecompressFile } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { decompressFileSchema } from '#shared/schema/server/operations';

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
    requiredPermissions: ['server.files.compress'],
  });

  const body = await readValidatedBodyWithLimit(
    event,
    decompressFileSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    if (!server.nodeId) {
      throw createError({ status: 500, statusText: 'Server has no assigned node' });
    }

    await remoteDecompressFile(server.uuid, body.root, body.file, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.decompress',
      server: { id: server.id, uuid: server.uuid },
      metadata: { root: body.root, file: body.file },
    });

    return {
      data: {
        success: true,
        message: 'File decompressed successfully',
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to decompress file',
    });
  }
});
