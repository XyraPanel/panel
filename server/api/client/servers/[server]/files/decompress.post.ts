import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { decompressFileSchema } from '#shared/schema/server/operations';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.write'],
  });

  const { root, file } = await readValidatedBodyWithLimit(
    event,
    decompressFileSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.decompressFile(server.uuid, root || '/', file);

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.id,
      actorType: 'user',
      action: 'server.file.decompress',
      targetType: 'server',
      targetId: server.id,
      metadata: { root: root || '/', file },
    });

    return {
      success: true,
      message: 'File decompressed successfully',
    };
  } catch (error) {
    console.error('Failed to decompress file on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to decompress file',
    });
  }
});
