import { randomUUID } from 'node:crypto';
import { useDrizzle, tables } from '#server/utils/drizzle';
import type { LogActivityOptions } from '#shared/types/audit';

export async function logActivity(options: LogActivityOptions): Promise<void> {
  const { actor, actorType, action, targetType, targetId, metadata } = options;

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();

    await db.insert(tables.auditEvents).values({
      id: randomUUID(),
      occurredAt: now,
      actor,
      actorType,
      action,
      targetType,
      targetId: targetId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: now,
    });
  } catch (error) {
    console.error('[Activity Log] Failed to log activity:', error);
  }
}

export function logAuth(
  userId: string,
  action: 'auth.login' | 'auth.logout' | 'auth.failed',
  metadata?: ActivityMetadata,
): void {
  logActivity({
    actor: userId,
    actorType: 'user',
    action,
    targetType: 'session',
    metadata,
  });
}

export function log2FA(
  userId: string,
  action: 'auth.2fa.enabled' | 'auth.2fa.disabled' | 'auth.2fa.verified' | 'auth.recovery.used',
  metadata?: ActivityMetadata,
): void {
  logActivity({
    actor: userId,
    actorType: 'user',
    action,
    targetType: 'user',
    targetId: userId,
    metadata,
  });
}

export function logUserEvent(
  actorId: string,
  action:
    | 'user.created'
    | 'user.updated'
    | 'user.deleted'
    | 'user.password.changed'
    | 'user.role.changed',
  targetUserId: string,
  metadata?: ActivityMetadata,
): void {
  logActivity({
    actor: actorId,
    actorType: 'user',
    action,
    targetType: 'user',
    targetId: targetUserId,
    metadata,
  });
}

export function logServerEvent(
  actorId: string,
  action:
    | 'server.created'
    | 'server.updated'
    | 'server.deleted'
    | 'server.started'
    | 'server.stopped'
    | 'server.restarted'
    | 'server.suspended'
    | 'server.unsuspended',
  serverId: string,
  metadata?: ActivityMetadata,
): void {
  logActivity({
    actor: actorId,
    actorType: 'user',
    action,
    targetType: 'server',
    targetId: serverId,
    metadata,
  });
}

export function getRequestMetadata(event: {
  node?: {
    req?: {
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    };
  };
}): ActivityMetadata {
  const headers = event.node?.req?.headers || {};

  const getHeader = (key: string): string | undefined => {
    const value = headers[key];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };

  return {
    ip:
      getHeader('x-forwarded-for') ||
      getHeader('x-real-ip') ||
      event.node?.req?.socket?.remoteAddress,
    userAgent: getHeader('user-agent'),
  };
}
