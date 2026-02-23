import { remoteUploadFiles } from '#server/utils/wings/registry';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
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
    requiredPermissions: ['server.files.upload'],
  });

  const formData = await readMultipartFormData(event);

  if (!formData) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'No form data provided',
    });
  }

  const directory = formData.find(
    (field) => field.name === 'directory' && typeof field.data === 'string',
  )?.data as string | undefined;
  const files = formData.filter((field) => field.name === 'files' && field.type === 'file');

  if (!directory) {
    throw createError({
      status: 422,
      statusText: 'Unprocessable Entity',
      message: 'Target directory is required',
    });
  }

  if (files.length === 0) {
    throw createError({
      status: 422,
      statusText: 'Unprocessable Entity',
      message: 'At least one file is required for upload',
    });
  }

  try {
    if (!server.nodeId) {
      throw createError({ status: 500, statusText: 'Server has no assigned node' });
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
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to upload files',
      cause: error,
    });
  }
});
