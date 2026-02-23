import { requireServerPermission } from '#server/utils/permission-middleware';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordServerActivity } from '#server/utils/server-activity';
import { getServerWithAccess } from '#server/utils/server-helpers';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { createDirectorySchema } from '#shared/schema/server/operations';

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

  const permissionContext = await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.write'],
  });

  const body = await readValidatedBodyWithLimit(
    event,
    createDirectorySchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const name = body.name.trim();
  const root = body.root && body.root.length > 0 ? body.root : '/';

  try {
    const { client } = await getWingsClientForServer(server.uuid);

    await client.createDirectory(server.uuid as string, root, name);

    await recordServerActivity({
      event,
      actorId: permissionContext.userId,
      action: 'server.directory.create',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { directory: root, name },
    });

    return {
      success: true,
      data: {
        name,
        root,
      },
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
