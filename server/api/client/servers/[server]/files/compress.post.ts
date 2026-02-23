import { requireServerPermission } from '#server/utils/permission-middleware';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordServerActivity } from '#server/utils/server-activity';
import { getServerWithAccess } from '#server/utils/server-helpers';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { compressFilesSchema } from '#shared/schema/server/operations';

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
    requiredPermissions: ['server.files.compress'],
  });

  const { root, files } = await readValidatedBodyWithLimit(
    event,
    compressFilesSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    const result = (await client.compressFiles(server.uuid as string, root || '/', files)) as
      | { archive?: string }
      | undefined;

    await recordServerActivity({
      event,
      actorId: permissionContext.userId,
      action: 'server.file.compress',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: {
        root: root || '/',
        files,
        archive: typeof result?.archive === 'string' ? result.archive : undefined,
      },
    });

    return {
      success: true,
      message: 'Files compressed successfully',
      data: result,
    };
  } catch (error) {
    console.error('Failed to compress files on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to compress files',
    });
  }
});
