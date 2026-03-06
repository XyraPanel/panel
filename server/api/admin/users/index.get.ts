import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { z } from 'zod';
import { useDrizzle, tables, or } from '#server/utils/drizzle';
import { count, desc, sql, like } from 'drizzle-orm';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'List users',
    description:
      'Retrieves a paginated list of all users in the panel. Supports searching by email or username.',
    parameters: [
      {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number',
      },
      {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        description: 'Items per page',
      },
      {
        in: 'query',
        name: 'search',
        schema: { type: 'string' },
        description: 'Search by email or username',
      },
    ],
    responses: {
      200: {
        description: 'Paginated user list retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { type: 'array', items: { type: 'object' } },
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
      401: { description: 'Authentication required' },
      403: { description: 'Administrator privileges required' },
    },
  },
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.READ);

  const { page, limit, search } = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().min(1).catch(1).default(1),
      limit: z.coerce.number().min(1).max(100).catch(50).default(50),
      search: z.string().optional(),
    }),
  );
  const offset = (page - 1) * limit;

  const db = useDrizzle();

  const whereClause = search
    ? or(like(tables.users.email, `%${search}%`), like(tables.users.username, `%${search}%`))
    : undefined;

  const [totalResult, users] = await Promise.all([
    db.select({ count: count() }).from(tables.users).where(whereClause),
    db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        nameFirst: tables.users.nameFirst,
        nameLast: tables.users.nameLast,
        role: tables.users.role,
        rootAdmin: tables.users.rootAdmin,
        banned: tables.users.banned,
        emailVerified: tables.users.emailVerified,
        twoFactorEnabled: tables.users.twoFactorEnabled,
        useTotp: tables.users.useTotp,
        passwordResetRequired: tables.users.passwordResetRequired,
        createdAt: tables.users.createdAt,
        serversOwned:
          sql<number>`(select count(*) from ${tables.servers} where ${tables.servers.ownerId} = ${tables.users.id})`.mapWith(
            Number,
          ),
      })
      .from(tables.users)
      .where(whereClause)
      .orderBy(desc(tables.users.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return {
    data: users.map((u) => ({
      id: u.id,
      username: u.username ?? u.email ?? '',
      email: u.email ?? '',
      name: [u.nameFirst, u.nameLast].filter(Boolean).join(' ') || null,
      role: u.role ?? 'user',
      rootAdmin: Boolean(u.rootAdmin),
      suspended: Boolean(u.banned),
      emailVerified: Boolean(u.emailVerified),
      twoFactorEnabled: Boolean(u.twoFactorEnabled || u.useTotp),
      passwordResetRequired: Boolean(u.passwordResetRequired),
      createdAt: u.createdAt ?? new Date().toISOString(),
      serversOwned: u.serversOwned ?? 0,
      serversAccess: u.serversOwned ?? 0,
    })),
    pagination: {
      page,
      perPage: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
