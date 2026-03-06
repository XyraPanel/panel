import { remoteDeleteFiles } from '#server/utils/wings/registry';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { deleteFilesSchema } from '#shared/schema/server/operations';

defineRouteMeta({
  openAPI: {
    tags: ['File Manager'],
    summary: 'Delete files',
    description: 'Bulk deletes files or directories from the server instance using Wings.',
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
              root: { type: 'string', description: 'The absolute root directory containing the files to delete' },
              files: { type: 'array', items: { type: 'string' }, description: 'The filenames to delete relative to root' },
            },
            required: ['root', 'files'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Deletion successfully executed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'array', items: { type: 'string' } },
                    root: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.files.delete permission' },
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
    requiredPermissions: ['server.files.delete'],
  });

  const body = await readValidatedBodyWithLimit(event, deleteFilesSchema, BODY_SIZE_LIMITS.SMALL);
  const root = body.root && body.root.length > 0 ? body.root : '/';
  const files = body.files;

  if (!server.nodeId) {
    throw createError({ status: 500, message: 'Server has no assigned node' });
  }

  try {
    await remoteDeleteFiles(server.uuid, root, files, server.nodeId);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.delete',
      server: { id: server.id, uuid: server.uuid },
      metadata: { root, files },
    });

    return {
      data: {
        deleted: files,
        root,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      message: `Wings API Error: ${error instanceof Error ? error.message : 'Failed to delete files'}`,
      cause: error,
    });
  }
});
