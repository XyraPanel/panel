import { desc, eq, sql } from 'drizzle-orm';
import type { PaginatedServerActivityResponse, ServerActivityEvent } from '#shared/types/server';
import type { ActorType, TargetType } from '#shared/types/audit';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    return { value };
  } catch {
    return { raw };
  }
}

export default defineEventHandler(async (event): Promise<PaginatedServerActivityResponse> => {
  const accountContext = await requireAccountUser(event);
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      statusText: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
  });

  const query = getQuery(event);
  const page = Math.max(Number.parseInt((query.page as string) ?? '1', 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt((query.limit as string) ?? '25', 10) || 25, 1),
    100,
  );
  const offset = (page - 1) * limit;

  const db = useDrizzle();
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.auditEvents)
    .where(eq(tables.auditEvents.targetId, server.id))
    .limit(1);

  const count = countRows[0]?.count ?? 0;

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
    occurredAt:
      row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt).toISOString(),
    actor: row.actor,
    actorType: row.actorType as ActorType,
    action: row.action,
    targetType: row.targetType as TargetType,
    targetId: row.targetId,
    metadata: parseMetadata(row.metadata),
  }));

  const total = Number(count ?? 0);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

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
