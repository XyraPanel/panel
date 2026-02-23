import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { desc, count } from 'drizzle-orm';
import { getNumericSetting, SETTINGS_KEYS } from '#server/utils/settings';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

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
    .select({ id: tables.users.id })
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

  const totalResult = await db
    .select({ count: count() })
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user.id));

  const totalCount = Number(totalResult[0]?.count ?? 0);

  const apiKeys = await db
    .select({
      id: tables.apiKeys.id,
      identifier: tables.apiKeys.identifier,
      memo: tables.apiKeys.memo,
      createdAt: tables.apiKeys.createdAt,
      lastUsedAt: tables.apiKeys.lastUsedAt,
      expiresAt: tables.apiKeys.expiresAt,
    })
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user.id))
    .orderBy(desc(tables.apiKeys.createdAt))
    .limit(limit)
    .offset(offset);

  const formatTimestamp = (value: number | Date | null | undefined) => {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const totalPages = Math.ceil(totalCount / limit);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.user.api_key.listed',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      userId: user.id,
      page,
      perPage: limit,
    },
  });

  return {
    data: apiKeys.map((key) => ({
      id: key.id,
      identifier: key.identifier,
      memo: key.memo,
      createdAt: formatTimestamp(key.createdAt)!,
      lastUsedAt: formatTimestamp(key.lastUsedAt),
      expiresAt: formatTimestamp(key.expiresAt),
    })),
    pagination: {
      page,
      perPage: limit,
      total: totalCount,
      totalPages,
    },
  };
});
