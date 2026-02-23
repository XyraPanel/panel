import { remoteDeleteFiles } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { deleteFilesSchema } from '#shared/schema/server/operations';

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
    requiredPermissions: ['server.files.delete'],
  });

  const body = await readValidatedBodyWithLimit(event, deleteFilesSchema, BODY_SIZE_LIMITS.SMALL);
  const root = body.root && body.root.length > 0 ? body.root : '/';
  const files = body.files;

  if (!server.nodeId) {
    throw createError({ status: 500, statusText: 'Server has no assigned node' });
  }

  try {
    await remoteDeleteFiles(server.uuid, root, files, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.delete',
      server: { id: server.id, uuid: server.uuid },
      metadata: { root, files },
    });

    return {
      data: {
        deleted: files,
        root,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to delete files',
      cause: error,
    });
  }
});
