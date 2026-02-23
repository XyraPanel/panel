import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEvent } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import type { ActivityAction } from '#shared/types/audit';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { remoteServerArchiveStatusSchema } from '#shared/schema/wings';

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle();
  const { uuid } = event.context.params ?? {};

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ status: 400, statusText: 'Missing server UUID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const { successful } = await readValidatedBodyWithLimit(
    event,
    remoteServerArchiveStatusSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1);

  const server = serverRows[0];

  if (!server) {
    throw createError({ status: 404, statusText: 'Server not found' });
  }

  if (server.nodeId !== nodeId) {
    throw createError({ status: 403, statusText: 'Server does not belong to this node' });
  }

  if (successful) {
    await db
      .update(tables.servers)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.servers.id, server.id));
  }

  await recordAuditEvent({
    actor: 'wings-daemon',
    actorType: 'daemon',
    action: (successful ? 'server.archive_success' : 'server.archive_failed') as ActivityAction,
    targetType: 'server',
    targetId: uuid,
    metadata: {
      status: successful ? 'success' : 'failed',
      archivedAt: new Date().toISOString(),
    },
  });

  return {
    data: {
      success: true,
      archived: successful,
    },
  };
});
