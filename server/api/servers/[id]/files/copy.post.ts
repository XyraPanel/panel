import { remoteCopyFile } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { copyFileSchema } from '#shared/schema/server/operations';

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

  const body = await readValidatedBodyWithLimit(event, copyFileSchema, BODY_SIZE_LIMITS.SMALL);
  const location = body.location;

  try {
    if (!server.nodeId) {
      throw createError({ status: 500, statusText: 'Server has no assigned node' });
    }

    await remoteCopyFile(server.uuid, location, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.copy',
      server: { id: server.id, uuid: server.uuid },
      metadata: { location },
    });

    return {
      data: {
        location,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to copy file',
      cause: error,
    });
  }
});
