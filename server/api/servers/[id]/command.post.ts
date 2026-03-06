import { getWingsClientForServer } from '#server/utils/wings-client';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { serverCommandSchema } from '#shared/schema/server/operations';

defineRouteMeta({
  openAPI: {
    tags: ['Server Operations'],
    summary: 'Send console command',
    description: 'Sends a specific text command to be executed in the server\'s running console/stdin.',
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
              command: { type: 'string', description: 'The command string to send to the server' },
            },
            required: ['command'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Command successfully accepted and sent to Wings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing server identifier or empty command' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.command permission' },
      500: { description: 'Wings daemon error or server misconfiguration' },
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

  const accountContext = await requireAccountUser(event);
  const { user, session } = accountContext;

  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.command'],
  });

  const body = await readValidatedBodyWithLimit(event, serverCommandSchema, BODY_SIZE_LIMITS.SMALL);

  if (!server.nodeId) {
    throw createError({ status: 500, message: 'Server has no assigned node' });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.sendCommand(server.uuid, body.command);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.command.sent',
      server: { id: server.id, uuid: server.uuid },
      metadata: { command: body.command },
    });

    return {
      data: {
        success: true,
        message: 'Command sent successfully',
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      message: `Wings API Error: ${error instanceof Error ? error.message : 'Failed to send command'}`,
    });
  }
});
