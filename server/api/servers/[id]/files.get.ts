import { type H3Event } from 'h3';
import { remoteListServerDirectory } from '#server/utils/wings/registry';
import { debugError } from '#server/utils/logger';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { z } from 'zod';

defineRouteMeta({
  openAPI: {
    tags: ['File Manager'],
    summary: 'List directory contents',
    description: 'Retrieves a list of files and folders within a specified directory on the server\'s disk via Wings.',
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
        name: 'directory',
        schema: { type: 'string', default: '/' },
        description: 'The path of the directory to list',
      },
    ],
    responses: {
      200: {
        description: 'Directory listing retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      mode: { type: 'string' },
                      size: { type: 'integer' },
                      is_directory: { type: 'boolean' },
                      is_file: { type: 'boolean' },
                      is_symlink: { type: 'boolean' },
                      mimetype: { type: 'string' },
                      created_at: { type: 'string', format: 'date-time' },
                      modified_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Server not ready or missing identifier' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.files.read permission' },
      404: { description: 'Directory not found' },
      502: { description: 'Wings daemon communication error' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  const { id: identifier } = getRouterParams(event);
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

  const { directory } = await getValidatedQuery(
    event,
    z.object({
      directory: z.string().default('/'),
    }),
  );

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  try {
    const nodeId = server.nodeId ? String(server.nodeId) : undefined;
    const listing = await remoteListServerDirectory(server.uuid, directory, nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.listed',
      server: { id: server.id, uuid: server.uuid },
      metadata: { directory, nodeId },
    });

    return { data: listing };
  } catch (error) {
    let errorMessage = 'Unable to list server directory.';
    let status = 502;
    let errorData: Record<string, unknown> = {};

    if (isRecord(error) && 'status' in error) {
      status = typeof error.status === 'number' ? error.status : status;
      errorMessage = typeof error.message === 'string' ? error.message : errorMessage;

      if (isRecord(error.data)) {
        errorData = error.data;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    debugError('[Files List] Failed to list directory:', {
      serverUuid: server.uuid,
      serverStatus: server.status,
      directory,
      error: errorMessage,
      status,
    });

    if (server.status === 'installing') {
      throw createError({
        status: 400,
        message: 'Server not ready: The server is currently installing. Please wait for installation to complete.',
        data: {
          serverUuid: server.uuid,
          status: server.status,
          wingsError: errorMessage,
        },
      });
    }

    if (
      server.status === 'install_failed' &&
      (errorMessage.includes('directory') || errorMessage.includes('not found') || status === 404)
    ) {
      throw createError({
        status: 404,
        message:
          'Server directory not found: The server directory does not exist. This usually happens when installation fails. Please try installing the server again using the "Install on Wings" button.',
        data: {
          serverUuid: server.uuid,
          status: server.status,
          wingsError: errorMessage,
        },
      });
    }

    if (status === 403) {
      throw createError({
        status: 502,
        message:
          'Wings Authentication Failed: Unable to authenticate with Wings daemon. The Wings node token may be incorrect. Please update your Wings configuration with the token from Admin → Wings → Nodes → [Your Node] → Configuration.',
        data: {
          serverUuid: server.uuid,
          directory,
          nodeId: server.nodeId,
          wingsError: errorMessage,
          ...errorData,
        },
        cause: error,
      });
    }

    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }

    throw createError({
      status,
      message: `Wings request failed: ${errorMessage}`,
      data: {
        serverUuid: server.uuid,
        directory,
        ...errorData,
      },
      cause: error,
    });
  }
});
