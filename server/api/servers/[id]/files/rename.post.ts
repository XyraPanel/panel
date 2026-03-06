import { remoteRenameFiles } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { renameFilesSchema } from '#shared/schema/server/operations';

defineRouteMeta({
  openAPI: {
    tags: ['File Manager'],
    summary: 'Rename files',
    description:
      'Renames or moves files and directories within a specified root directory using Wings.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Server internal ID, UUID, or identifier',
      },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              root: { type: 'string', description: 'The base directory path' },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string', description: 'Original filename' },
                    to: { type: 'string', description: 'New filename' },
                  },
                },
              },
            },
            required: ['root', 'files'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Files successfully renamed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    root: { type: 'string' },
                    files: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.files.write permission' },
      500: { description: 'Wings daemon error' },
    },
  },
});

export default defineEventHandler(async (event) => {
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
    requiredPermissions: ['server.files.write'],
  });

  const body = await readValidatedBodyWithLimit(event, renameFilesSchema, BODY_SIZE_LIMITS.SMALL);
  const root = body.root && body.root.length > 0 ? body.root : '/';
  const files = body.files;

  if (!server.nodeId) {
    throw createError({ status: 500, message: 'Server has no assigned node' });
  }

  try {
    await remoteRenameFiles(server.uuid, root, files, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.rename',
      server: { id: server.id, uuid: server.uuid },
      metadata: { root, files },
    });

    return {
      data: {
        root,
        files,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      message: `Wings API Error: ${error instanceof Error ? error.message : 'Failed to rename files'}`,
      cause: error,
    });
  }
});
