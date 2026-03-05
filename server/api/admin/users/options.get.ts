import { useDrizzle, tables } from '#server/utils/drizzle';
import { z } from 'zod';
import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { desc, like, or } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.READ);

  const { search: rawSearch, limit } = await getValidatedQuery(
    event,
    z.object({
      search: z.string().trim().catch('').default(''),
      limit: z.coerce.number().min(1).max(1000).catch(250).default(250),
    }),
  );

  const db = useDrizzle();
  const whereClause =
    rawSearch.length > 0
      ? or(
          like(tables.users.username, `%${rawSearch}%`),
          like(tables.users.email, `%${rawSearch}%`),
          like(tables.users.nameFirst, `%${rawSearch}%`),
          like(tables.users.nameLast, `%${rawSearch}%`),
        )
      : undefined;

  const users = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
      role: tables.users.role,
      rootAdmin: tables.users.rootAdmin,
    })
    .from(tables.users)
    .where(whereClause)
    .orderBy(desc(tables.users.createdAt))
    .limit(limit);

  return {
    data: users.map((user) => ({
      id: user.id,
      username: user.username ?? user.email ?? '',
      email: user.email ?? '',
      name: [user.nameFirst, user.nameLast].filter(Boolean).join(' ') || null,
      role: user.role ?? (user.rootAdmin ? 'admin' : 'user'),
    })),
  };
});
