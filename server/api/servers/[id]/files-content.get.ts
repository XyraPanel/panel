import { type H3Event } from 'h3';
import { remoteGetFileContents } from '#server/utils/wings/registry';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event: H3Event) => {
  setHeader(event, 'Content-Type', 'application/json');

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
    requiredPermissions: ['server.files.read'],
  });

  // Allow file access regardless of server status (offline, online, etc.)
  // Users need to access files even when the server is stopped
  // Only Wings connectivity issues will prevent access

  const query = getQuery(event);
  const file = typeof query.file === 'string' ? query.file : null;

  if (!file) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing file path',
    });
  }

  try {
    const result = await remoteGetFileContents(server.uuid, file, server.nodeId ?? undefined);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.read',
      server: { id: server.id, uuid: server.uuid },
      metadata: { file },
    });

    return { data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unable to read file contents.';

    console.error('[Files Content] Error fetching file:', {
      serverUuid: server.uuid,
      filePath: file,
      error: errorMessage,
      errorType: error instanceof Error ? error.name : typeof error,
    });

    throw createError({
      status: 502,
      statusText: 'Wings request failed',
      message: errorMessage,
      cause: error,
    });
  }
});
