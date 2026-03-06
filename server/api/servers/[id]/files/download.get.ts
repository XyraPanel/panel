import { type H3Event } from 'h3';
import { z } from 'zod';
import { remoteGetFileDownloadUrl } from '#server/utils/wings/registry';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

defineRouteMeta({
  openAPI: {
    tags: ['File Manager'],
    summary: 'Get file download URL',
    description:
      'Generates a secure, short-lived download URL for a specific file, served directly by the Wings node.',
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
        description: 'The relative path of the file to download',
      },
    ],
    responses: {
      200: {
        description: 'Download URL successfully generated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'The timed download URL from Wings' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing server identifier or file path' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.files.download permission' },
      500: { description: 'Wings daemon error' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
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
    requiredPermissions: ['server.files.download'],
    allowOwner: true,
    allowAdmin: true,
  });

  const query = await getValidatedQuery(
    event,
    z.object({
      file: z.string().optional(),
    }),
  );
  const file = query.file ?? '';

  if (!file) {
    throw createError({
      status: 400,
      message: 'Bad Request: File path is required',
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
      message: `Wings API Error: ${error instanceof Error ? error.message : 'Failed to generate download URL'}`,
      cause: error,
    });
  }
});
