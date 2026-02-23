import { randomUUID } from 'node:crypto';
import { type H3Event } from 'h3';

import { useDrizzle, tables } from '#server/utils/drizzle';
import type { LogActivityOptions, ActivityMetadata } from '#shared/types/audit';

function sanitizeMetadata(metadata: ActivityMetadata): ActivityMetadata {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  return Object.fromEntries(entries) as ActivityMetadata;
}

export async function buildRequestMetadata(
  event: H3Event,
  overrides: ActivityMetadata = {},
): Promise<ActivityMetadata> {
  let fingerprint: string | null = null;
  try {
    fingerprint = await getRequestFingerprint(event);
  } catch {
    fingerprint = null;
  }

  const base: ActivityMetadata = {
    ip: getRequestIP(event) ?? undefined,
    host: getRequestHost(event, { xForwardedHost: true }) ?? undefined,
    protocol: getRequestProtocol(event, { xForwardedProto: true }) ?? undefined,
    url: getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })?.toString(),
    method: event.method,
    userAgent: getHeader(event, 'user-agent') ?? undefined,
    fingerprint,
  };

  return sanitizeMetadata({ ...base, ...overrides });
}

export async function recordAuditEvent(input: LogActivityOptions): Promise<void> {
  const db = useDrizzle();
  const now = new Date();

  const actor = input.actor.trim();
  const actorValue = actor.length > 0 ? actor : 'system';
  const actorType = input.actorType ?? 'system';

  let serializedMetadata: string | null = null;
  if (input.metadata && Object.keys(input.metadata as ActivityMetadata).length > 0) {
    try {
      serializedMetadata = JSON.stringify(input.metadata);
    } catch {
      serializedMetadata = null;
    }
  }

  await db.insert(tables.auditEvents).values({
    id: randomUUID(),
    occurredAt: now,
    actor: actorValue,
    actorType,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: serializedMetadata,
    createdAt: now,
  });
}

export async function recordAuditEventFromRequest(
  event: H3Event,
  input: Omit<LogActivityOptions, 'metadata'> & { metadata?: ActivityMetadata },
): Promise<void> {
  const metadata = await buildRequestMetadata(event, input.metadata);
  await recordAuditEvent({ ...input, metadata });
}
