import { getWingsClientForServer } from '#server/utils/wings-client';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { serverPowerActionSchema } from '#shared/schema/server/operations';

defineRouteMeta({
  openAPI: {
    tags: ['Server Operations'],
    summary: 'Send power action',
    description:
      'Sends a power control signal (start, stop, restart, kill) to the server instance via Wings.',
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
              action: { type: 'string', enum: ['start', 'stop', 'restart', 'kill'] },
            },
            required: ['action'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Power action successfully queued',
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
      400: { description: 'Missing server identifier or invalid action' },
      401: { description: 'Authentication required' },
      403: { description: 'Missing server.power permission' },
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
    requiredPermissions: ['server.power'],
  });

  const body = await readValidatedBodyWithLimit(
    event,
    serverPowerActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  if (!server.nodeId) {
    throw createError({ status: 500, message: 'Server has no assigned node' });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.sendPowerAction(server.uuid, body.action);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.power.action',
      server: { id: server.id, uuid: server.uuid },
      metadata: { action: body.action },
    });

    return {
      data: {
        success: true,
        message: `Power action '${body.action}' sent successfully`,
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      message: `Wings API Error: ${error instanceof Error ? error.message : 'Failed to send power action'}`,
    });
  }
});
