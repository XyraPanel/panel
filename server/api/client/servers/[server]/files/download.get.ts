import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const query = getQuery(event);
  const file = query.file as string;

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  if (!file) {
    throw createError({
      status: 400,
      message: 'File path is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.download'],
  });

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    const downloadUrl = client.getFileDownloadUrl(server.uuid, file);

    return {
      attributes: {
        url: downloadUrl,
      },
    };
  } catch (error) {
    console.error('Failed to get download URL from Wings:', error);
    throw createError({
      status: 500,
      message: 'Failed to get download URL',
    });
  }
});
