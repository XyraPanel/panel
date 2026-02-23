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

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
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
    throw createError({ status: 500, statusText: 'Server has no assigned node' });
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
      statusText: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to send power action',
    });
  }
});
