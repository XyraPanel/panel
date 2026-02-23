import { z } from 'zod';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
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
      successful: z.boolean(),
    }),
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const now = new Date();

  if (body.successful) {
    await db
      .update(tables.servers)
      .set({
        status: null,
        installedAt: now,
        updatedAt: now,
      })
      .where(eq(tables.servers.id, server.id));
  } else {
    await db
      .update(tables.servers)
      .set({
        status: 'install_failed',
        updatedAt: now,
      })
      .where(eq(tables.servers.id, server.id));
  }

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: body.successful ? 'server.install.success' : 'server.install.failed',
    targetType: 'server',
    targetId: server.id,
  });

  return {
    data: {
      success: true,
      message: body.successful
        ? 'Installation marked as complete'
        : 'Installation marked as failed',
    },
  };
});
