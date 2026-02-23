import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, or } from '#server/utils/drizzle';
import { count, desc, sql, like } from 'drizzle-orm';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.READ);

  const query = getQuery(event);
  const search = query.search as string | undefined;
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(query.limit ?? '25'), 10) || 25));
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
