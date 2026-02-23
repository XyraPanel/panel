import { randomUUID } from 'node:crypto';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { serverScheduleCreateSchema } from '#shared/schema/server/operations';

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
    requiredPermissions: ['server.schedule.create'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(
    event,
    serverScheduleCreateSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  const scheduleId = randomUUID();
  const timestamp = new Date();

  try {
    await db.insert(tables.serverSchedules).values({
      id: scheduleId,
      serverId: server.id,
      name: body.name,
      cron: body.cron,
      action: body.action,
      nextRunAt: null,
      lastRunAt: null,
      enabled: body.enabled ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to create schedule',
    });
  }

  await invalidateScheduleCaches({ serverId: server.id });

  await Promise.all([
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.schedule.created',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        scheduleId,
        name: body.name,
      },
    }),
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.schedule.created',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        scheduleId,
        name: body.name,
      },
    }),
  ]);

  return {
    data: {
      id: scheduleId,
      name: body.name,
      cron: body.cron,
      action: body.action,
      enabled: body.enabled ?? true,
    },
  };
});
