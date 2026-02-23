import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { copyFileSchema } from '#shared/schema/server/operations';

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

  const { location } = await readValidatedBodyWithLimit(
    event,
    copyFileSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.copyFile(server.uuid, location);

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.id,
      actorType: 'user',
      action: 'server.file.copy',
      targetType: 'server',
      targetId: server.id,
      metadata: { location },
    });

    return {
      success: true,
      message: 'File copied successfully',
    };
  } catch (error) {
    console.error('Failed to copy file on Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to copy file',
    });
  }
});
