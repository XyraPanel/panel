import { z } from 'zod';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const uuid = getRouterParam(event, 'uuid');
  if (!uuid) {
    throw createError({
      status: 400,
      message: 'Server UUID is required',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(uuid, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.update'],
  });

  const body = await readValidatedBodyWithLimit(
    event,
    z.object({
      state: z
        .enum(['starting', 'running', 'stopping', 'stopped', 'offline'])
        .describe('Power state'),
    }),
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  await db
    .update(tables.servers)
    .set({
      status: body.state === 'running' ? null : body.state,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.servers.id, server.id));

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'server.power_state.updated',
    targetType: 'server',
    targetId: server.id,
    metadata: { state: body.state },
  });

  return {
    data: {
      success: true,
      message: `Server power state updated to: ${body.state}`,
    },
  };
});
