import { type H3Event } from 'h3';
import { remoteGetFileDownloadUrl } from '#server/utils/wings/registry';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event: H3Event) => {
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
    requiredPermissions: ['server.files.download'],
    allowOwner: true,
    allowAdmin: true,
  });

  const query = getQuery(event);
  const file = typeof query.file === 'string' ? query.file : '';

  if (!file) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'File path is required',
    });
  }

  try {
    const result = await remoteGetFileDownloadUrl(server.uuid, file, server.nodeId ?? undefined);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.download_url_requested',
      server: { id: server.id, uuid: server.uuid },
      metadata: { file },
    });

    return {
      data: result,
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to generate download URL',
      cause: error,
    });
  }
});
