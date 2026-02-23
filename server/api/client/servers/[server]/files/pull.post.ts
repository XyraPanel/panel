import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { pullFileSchema } from '#shared/schema/server/operations';

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

  const { url, directory } = await readValidatedBodyWithLimit(
    event,
    pullFileSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.pullFile(server.uuid, url, directory || '/', undefined, undefined, true);

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.id,
      actorType: 'user',
      action: 'server.file.pull',
      targetType: 'server',
      targetId: server.id,
      metadata: { url, directory: directory || '/' },
    });

    return {
      success: true,
      message: 'File pull initiated',
    };
  } catch (error) {
    console.error('Failed to pull file on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to pull file from URL',
    });
  }
});
