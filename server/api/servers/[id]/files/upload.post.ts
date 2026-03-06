import { remoteUploadFiles } from '#server/utils/wings/registry';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

defineRouteMeta({
  openAPI: {
    tags: ['File Manager'],
    summary: 'Upload files',
    description:
      'Uploads one or more files to a specific directory on the server instance using multipart form data.',
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
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              directory: { type: 'string', description: 'Target directory for the upload' },
              files: {
                type: 'array',
                items: { type: 'string', format: 'binary' },
                description: 'One or more files to upload',
              },
            },
            required: ['directory', 'files'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Files successfully uploaded',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    uploaded: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing form data or server identifier' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.files.upload permission' },
      422: { description: 'Unprocessable Entity: Missing directory or files' },
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
    requiredPermissions: ['server.files.upload'],
  });

  const formData = await readMultipartFormData(event);

  if (!formData) {
    throw createError({
      status: 400,
      message: 'Bad Request: No form data provided',
    });
  }

  const directoryField = formData.find(
    (field) => field.name === 'directory' && typeof field.data === 'string',
  );
  const directory = directoryField ? String(directoryField.data) : undefined;
  const files = formData.filter((field) => field.name === 'files' && field.type === 'file');

  if (!directory) {
    throw createError({
      status: 422,
      message: 'Unprocessable Entity: Target directory is required',
    });
  }

  if (files.length === 0) {
    throw createError({
      status: 422,
      message: 'Unprocessable Entity: At least one file is required for upload',
    });
  }

  try {
    if (!server.nodeId) {
      throw createError({ status: 500, message: 'Server has no assigned node' });
    }

    await remoteUploadFiles(
      server.uuid,
      directory,
      files.map((file) => ({
        name: file.filename ?? 'upload.bin',
        data: file.data,
        mime: file.type,
      })),
      server.nodeId,
    );

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.upload',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        directory,
        fileCount: files.length,
      },
    });

    return {
      data: {
        success: true,
        uploaded: files.length,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      message: `Wings API Error: ${error instanceof Error ? error.message : 'Failed to upload files'}`,
      cause: error,
    });
  }
});
