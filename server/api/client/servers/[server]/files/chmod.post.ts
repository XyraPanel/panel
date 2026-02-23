import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordServerActivity } from '#server/utils/server-activity';
import { chmodBodySchema } from '#shared/schema/server/operations';

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverId, accountContext.session);

  const permissionContext = await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.write'],
  });

  const { root, files } = await readValidatedBodyWithLimit(
    event,
    chmodBodySchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const targetRoot = root && root.length > 0 ? root : '/';

  try {
    const { client } = await getWingsClientForServer(server.uuid as string);
    await client.chmodFiles(
      server.uuid as string,
      targetRoot,
      files.map((entry) => ({
        ...entry,
        mode: typeof entry.mode === 'number' ? String(entry.mode) : entry.mode,
      })),
    );

    await recordServerActivity({
      event,
      actorId: permissionContext.userId,
      action: 'server.file.chmod',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { root: targetRoot, files: files.map((f) => ({ file: f.file, mode: f.mode })) },
    });

    return {
      data: {
        success: true,
        message: 'Permissions changed successfully',
      },
    };
  } catch (error) {
    console.error('Failed to change permissions on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to change permissions',
    });
  }
});
