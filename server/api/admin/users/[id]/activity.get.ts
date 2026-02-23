import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { desc, count } from 'drizzle-orm';
import { getNumericSetting, SETTINGS_KEYS } from '#server/utils/settings';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      message: 'User ID is required',
    });
  }

  const query = getQuery(event);
  const page = Math.max(1, Number.parseInt((query.page as string) ?? '1', 10) || 1);
  const defaultLimit = await getNumericSetting(SETTINGS_KEYS.PAGINATION_LIMIT, 25);
  const limit = Math.min(
    100,
    Math.max(10, Number.parseInt((query.limit as string) ?? String(defaultLimit), 10) || 25),
  );
  const offset = (page - 1) * limit;

  const db = useDrizzle();

  const userResult = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      username: tables.users.username,
    })
    .from(tables.users)
    .where(eq(tables.users.id, id))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw createError({
      status: 404,
      message: 'User not found',
    });
  }

  const activityConditions = [eq(tables.auditEvents.actor, user.id)];
  if (user.email) {
    activityConditions.push(eq(tables.auditEvents.actor, user.email));
  }
  if (user.username) {
    activityConditions.push(eq(tables.auditEvents.actor, user.username));
  }

  const totalResult = await db
    .select({ count: count() })
    .from(tables.auditEvents)
    .where(or(...activityConditions));

  const totalCount = Number(totalResult[0]?.count ?? 0);

  const activityEvents = await db
    .select({
      id: tables.auditEvents.id,
      occurredAt: tables.auditEvents.occurredAt,
      action: tables.auditEvents.action,
      actor: tables.auditEvents.actor,
      targetType: tables.auditEvents.targetType,
      targetId: tables.auditEvents.targetId,
      metadata: tables.auditEvents.metadata,
    })
    .from(tables.auditEvents)
    .where(or(...activityConditions))
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  const formatTimestamp = (value: number | Date | null | undefined) => {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const parseMetadata = (value: string | null) => {
    if (!value) {
      return {};
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { raw: value };
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'admin.user.activity.viewed',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      actorUserId: user.id,
      page,
      perPage: limit,
    },
  });

  return {
    data: activityEvents.map((entry) => ({
      id: entry.id,
      occurredAt: formatTimestamp(entry.occurredAt)!,
      action: entry.action,
      target: entry.targetId ? `${entry.targetType}#${entry.targetId}` : entry.targetType,
      actor: entry.actor,
      details: parseMetadata(entry.metadata ?? null),
    })),
    pagination: {
      page,
      perPage: limit,
      total: totalCount,
      totalPages,
    },
  };
});
