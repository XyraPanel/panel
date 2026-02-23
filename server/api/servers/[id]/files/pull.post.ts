import { remotePullFile } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { pullFileSchema } from '#shared/schema/server/operations';

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

  const body = await readValidatedBodyWithLimit(event, pullFileSchema, BODY_SIZE_LIMITS.SMALL);
  const directory = body.directory && body.directory.length > 0 ? body.directory : '/';

  try {
    if (!server.nodeId) {
      throw createError({ status: 500, statusText: 'Server has no assigned node' });
    }

    await remotePullFile(server.uuid, body.url, directory, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.pull',
      server: { id: server.id, uuid: server.uuid },
      metadata: { url: body.url, directory },
    });

    return {
      data: {
        url: body.url,
        directory,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to pull remote file',
      cause: error,
    });
  }
});
