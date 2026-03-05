import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireAccountUser } from '#server/utils/security';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import type { PaginatedServerActivityResponse, ServerActivityEvent } from '#shared/types/server';
import type { ActorType, TargetType } from '#shared/types/audit';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isActorType(value: unknown): value is ActorType {
  return value === 'user' || value === 'system' || value === 'daemon';
}

function isTargetType(value: unknown): value is TargetType {
  return (
    value === 'user' ||
    value === 'server' ||
    value === 'backup' ||
    value === 'node' ||
    value === 'database' ||
    value === 'file' ||
    value === 'settings' ||
    value === 'session' ||
    value === 'api_key'
  );
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as unknown;
    if (isRecord(value)) return value;

    return { value };
  } catch {
    return { raw };
  }
}

export default defineEventHandler(async (event): Promise<PaginatedServerActivityResponse> => {
  const serverIdentifier = getRouterParam(event, 'id');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { user, session } = await requireAccountUser(event);

  const { server } = await getServerWithAccess(serverIdentifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  });

  const { page, limit } = await getValidatedQuery(event, (data) => {
    const result = z
      .object({
        page: z.coerce.number().min(1).catch(1).default(1),
        limit: z.coerce.number().min(1).max(100).catch(50).default(50),
      })
      .safeParse(data);
    return result.success ? result.data : { page: 1, limit: 50 };
  });
  const offset = (page - 1) * limit;

  const db = useDrizzle();
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.auditEvents)
    .where(eq(tables.auditEvents.targetId, server.id))
    .limit(1);

  const rows = await db
    .select({
      id: tables.auditEvents.id,
      occurredAt: tables.auditEvents.occurredAt,
      actor: tables.auditEvents.actor,
      actorType: tables.auditEvents.actorType,
      action: tables.auditEvents.action,
      targetType: tables.auditEvents.targetType,
      targetId: tables.auditEvents.targetId,
      metadata: tables.auditEvents.metadata,
    })
    .from(tables.auditEvents)
    .where(eq(tables.auditEvents.targetId, server.id))
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  const data: ServerActivityEvent[] = rows.map((row) => ({
    id: row.id,
    occurredAt: new Date(row.occurredAt).toISOString(),
    actor: row.actor,
    actorType: isActorType(row.actorType) ? row.actorType : 'system',
    action: row.action,
    targetType: isTargetType(row.targetType) ? row.targetType : 'server',
    targetId: row.targetId,
    metadata: parseMetadata(row.metadata),
  }));

  const total = Number(countResult?.[0]?.count ?? 0);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'server.activity.viewed',
    targetType: 'server',
    targetId: server.id,
    metadata: { page, limit },
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
    generatedAt: new Date().toISOString(),
  };
});
