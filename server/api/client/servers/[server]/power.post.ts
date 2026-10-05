import { serverManager } from '#server/utils/server-manager';
import { logger } from '#server/utils/logger';
import { WingsConnectionError, WingsAuthError } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { getServerWithAccess } from '#server/utils/server-helpers';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { serverPowerActionSchema } from '#shared/schema/server/operations';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Send a power action',
    description:
      'Sends a power action (start, stop, restart, kill) to the server via the Wings daemon. Requires the server.power permission (or server owner/admin).',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['action'],
            properties: {
              action: { type: 'string', enum: ['start', 'stop', 'restart', 'kill'] },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Power action sent',
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
      '400': { description: 'Server identifier is missing, or invalid power action' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.power permission, or Wings authentication failed' },
      '404': { description: 'Server not found or not accessible' },
      '500': { description: 'Failed to send power action to Wings' },
      '503': { description: 'Wings daemon unavailable' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({ status: 400, message: 'Server identifier required' });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.power'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(
    event,
    serverPowerActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    await serverManager.powerAction(serverIdentifier, body.action, {
      userId: user.id,
    });

    await recordServerActivity({
      event,
      actorId: user.id,
      action: `server.power.${body.action}`,
      server: { id: server.id, uuid: server.uuid },
      metadata: { action: body.action },
    });

    return {
      data: {
        success: true,
        message: `Power action ${body.action} sent successfully`,
      },
    };
  } catch (error) {
    logger.error('Wings power action failed:', error);

    if (error instanceof WingsAuthError) {
      throw createError({
        status: 403,
        message: `Wings authentication failed: ${error.message}`,
      });
    }

    if (error instanceof WingsConnectionError) {
      throw createError({
        status: 503,
        message: `Wings daemon unavailable: ${error.message}`,
      });
    }

    throw createError({
      status: 500,
      message: 'Failed to send power action to Wings.',
    });
  }
});
