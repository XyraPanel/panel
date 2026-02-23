import type { H3Event } from 'h3';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { ActivityMetadata } from '#shared/types/audit';

interface RecordServerActivityOptions {
  event: H3Event;
  actorId: string;
  action: string;
  server: {
    id: string;
    uuid?: string | null;
  };
  metadata?: ActivityMetadata & Record<string, unknown>;
}

export async function recordServerActivity({
  event,
  actorId,
  action,
  server,
  metadata,
}: RecordServerActivityOptions): Promise<void> {
  await recordAuditEventFromRequest(event, {
    actor: actorId,
    actorType: 'user',
    action,
    targetType: 'server',
    targetId: server.id,
    metadata: {
      serverUuid: server.uuid ?? undefined,
      ...metadata,
    },
  });
}
