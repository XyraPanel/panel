import { eq, and } from 'drizzle-orm';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { updateScheduleSchema } from '#shared/schema/server/operations';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { invalidateScheduleCaches } from '#server/utils/serversStore';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  const scheduleId = getRouterParam(event, 'scheduleId');

  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  if (!scheduleId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing schedule identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.update'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();

  const scheduleRows = await db
    .select()
    .from(tables.serverSchedules)
    .where(
      and(
        eq(tables.serverSchedules.id, scheduleId),
        eq(tables.serverSchedules.serverId, server.id),
      ),
    )
    .limit(1);

  const schedule = scheduleRows[0];

  if (!schedule) {
    throw createError({ status: 404, statusText: 'Schedule not found' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateScheduleSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.cron !== undefined) updateData.cron = body.cron;
  if (body.action !== undefined) updateData.action = body.action;
  if (body.enabled !== undefined) updateData.enabled = body.enabled;

  try {
    await db
      .update(tables.serverSchedules)
      .set(updateData)
      .where(eq(tables.serverSchedules.id, scheduleId));

    await invalidateScheduleCaches({ serverId: server.id, scheduleId });

    const updatedFields = Object.keys(updateData).filter((key) => key !== 'updatedAt');

    await Promise.all([
      recordServerActivity({
        event,
        actorId: user.id,
        action: 'server.schedule.updated',
        server: { id: server.id, uuid: server.uuid },
        metadata: {
          scheduleId,
          updatedFields,
        },
      }),
      recordAuditEventFromRequest(event, {
        actor: user.id,
        actorType: 'user',
        action: 'server.schedule.updated',
        targetType: 'server',
        targetId: server.id,
        metadata: {
          scheduleId,
          updatedFields,
        },
      }),
    ]);

    return {
      data: {
        success: true,
        message: 'Schedule updated successfully',
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to update schedule',
    });
  }
});
