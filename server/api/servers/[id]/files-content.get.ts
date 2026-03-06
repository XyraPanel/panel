import { type H3Event } from 'h3';
import { remoteGetFileContents } from '#server/utils/wings/registry';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { debugError } from '#server/utils/logger';
import { z } from 'zod';

defineRouteMeta({
  openAPI: {
    tags: ['File Manager'],
    summary: 'Get file content',
    description: 'Reads the text content of a file from the server instance instance via Wings. Used for the online file editor.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Server internal ID, UUID, or identifier',
      },
      {
        in: 'query',
        name: 'file',
        required: true,
        schema: { type: 'string' },
        description: 'The path of the file to read',
      },
    ],
    responses: {
      200: {
        description: 'File content successfully read',
        content: {
          'text/plain': {
            schema: { type: 'string' },
          },
        },
      },
      400: { description: 'Missing server identifier or file path' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.files.read permission' },
      502: { description: 'Wings daemon request failed' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  setHeader(event, 'Content-Type', 'application/json');

  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
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

  const { file } = await getValidatedQuery(
    event,
    z.object({
      file: z.string().min(1, 'File path is required'),
    }),
  );

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

    debugError('[Files Content] Error fetching file:', {
      serverUuid: server.uuid,
      filePath: file,
      error: errorMessage,
      errorType: error instanceof Error ? error.name : typeof error,
    });

    throw createError({
      status: 502,
      message: `Wings request failed: ${errorMessage}`,
      cause: error,
    });
  }
});
