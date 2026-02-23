import { remoteWriteFile } from '#server/utils/wings/registry';
import { debugError } from '#server/utils/logger';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { writeFileSchema } from '#shared/schema/server/operations';

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
    requiredPermissions: ['server.files.write'],
  });

  const body = await readValidatedBodyWithLimit(event, writeFileSchema, BODY_SIZE_LIMITS.MEDIUM);
  const filePath = body.file?.trim()?.length ? body.file : body.path || '';
  const contents = body.content ?? body.contents;

  if (!filePath || contents === undefined) {
    throw createError({
      status: 422,
      statusText: 'Unprocessable Entity',
      message: 'File path and content are required',
    });
  }

  try {
    if (!server.nodeId) {
      throw createError({ status: 500, statusText: 'Server has no assigned node' });
    }

    await remoteWriteFile(server.uuid, filePath, contents, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.write',
      server: { id: server.id, uuid: server.uuid },
      metadata: { file: filePath },
    });

    return {
      data: {
        success: true,
        message: 'File saved successfully',
      },
    };
  } catch (error) {
    debugError('[Files Write] Failed to save file to Wings:', {
      error: error instanceof Error ? error.message : String(error),
      serverUuid: server.uuid,
      filePath,
    });
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to write file',
    });
  }
});
