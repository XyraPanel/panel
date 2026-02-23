import { remoteCreateDirectory } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { createDirectorySchema } from '#shared/schema/server/operations';

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

  const body = await readValidatedBodyWithLimit(
    event,
    createDirectorySchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const name = body.name;
  const root = body.root && body.root.length > 0 ? body.root : '/';

  try {
    await remoteCreateDirectory(server.uuid, root, name);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.create_directory',
      server: { id: server.id, uuid: server.uuid },
      metadata: { root, name },
    });

    return {
      data: { name, root },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to create directory',
      cause: error,
    });
  }
});
