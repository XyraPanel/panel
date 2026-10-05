import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { z } from 'zod';
import { desc, count } from 'drizzle-orm';
import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Users'],
    summary: "List a user's API keys",
    description:
      'Returns a paginated list of API keys owned by the target user. Requires an admin session with the users:read ACL permission.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID',
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
    ],
    responses: {
      '200': {
        description: "Paginated list of the user's API keys",
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      identifier: { type: 'string', nullable: true },
                      memo: { type: 'string', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                      lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                      expiresAt: { type: 'string', format: 'date-time', nullable: true },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    perPage: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'User ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing users:read ACL permission' },
      '404': { description: 'User not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.READ);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      message: 'User ID is required',
    });
  }

  const { page, limit } = await getValidatedQuery(event, z.object({
    page: z.coerce.number().min(1).catch(1).default(1),
    limit: z.coerce.number().min(1).max(100).catch(50).default(50),
  }));
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

  const formatTimestamp = (value: number | Date | string | null | undefined) => {
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
      createdAt: formatTimestamp(key.createdAt) || new Date().toISOString(),
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
