import { useDrizzle, tables } from '#server/utils/drizzle';
import { z } from 'zod';
import { count, desc, inArray } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { AdminUsersPayload } from '#shared/types/admin';

export default defineEventHandler(async (event): Promise<AdminUsersPayload> => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.READ);

  const { page, limit } = await getValidatedQuery(event, (data) => {
    const result = z.object({
      page: z.coerce.number().min(1).catch(1).default(1),
      limit: z.coerce.number().min(1).max(100).catch(50).default(50)
    }).safeParse(data);
    return result.success ? result.data : { page: 1, limit: 50 };
  });
  const offset = (page - 1) * limit;

  const db = useDrizzle();

  const totalResult = await db.select({ count: count() }).from(tables.users);

  const total = totalResult[0]?.count ?? 0;

  const rows = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
      role: tables.users.role,
      rootAdmin: tables.users.rootAdmin,
      createdAt: tables.users.createdAt,
      banned: tables.users.banned,
      suspended: tables.users.suspended,
      emailVerified: tables.users.emailVerified,
      useTotp: tables.users.useTotp,
      passwordResetRequired: tables.users.passwordResetRequired,
    })
    .from(tables.users)
    .orderBy(desc(tables.users.createdAt))
    .limit(limit)
    .offset(offset);

  const userIds = rows.map((user) => user.id);
  const serverCounts = new Map<string, { owned: number; accessible: number }>();

  if (userIds.length > 0) {
    for (const userId of userIds) {
      serverCounts.set(userId, { owned: 0, accessible: 0 });
    }

    const ownedCounts = await db
      .select({
        userId: tables.servers.ownerId,
        count: count(),
      })
      .from(tables.servers)
      .where(inArray(tables.servers.ownerId, userIds))
      .groupBy(tables.servers.ownerId);

    const accessibleCounts = await db
      .select({
        userId: tables.serverSubusers.userId,
        count: count(),
      })
      .from(tables.serverSubusers)
      .where(inArray(tables.serverSubusers.userId, userIds))
      .groupBy(tables.serverSubusers.userId);

    for (const row of ownedCounts) {
      if (row.userId) {
        const current = serverCounts.get(row.userId) || { owned: 0, accessible: 0 };
        serverCounts.set(row.userId, { ...current, owned: row.count });
      }
    }

    for (const row of accessibleCounts) {
      if (row.userId) {
        const current = serverCounts.get(row.userId) || { owned: 0, accessible: 0 };
        serverCounts.set(row.userId, { ...current, accessible: row.count });
      }
    }
  }

  const users = rows.map((user) => {
    const counts = serverCounts.get(user.id) || { owned: 0, accessible: 0 };

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name:
        user.nameFirst && user.nameLast
          ? `${user.nameFirst} ${user.nameLast}`
          : user.nameFirst || user.nameLast || '',
      role: user.rootAdmin ? 'admin' : 'user',
      createdAt: new Date(user.createdAt).toISOString(),
      rootAdmin: Boolean(user.rootAdmin),
      suspended: Boolean(user.banned || user.suspended),
      emailVerified: Boolean(user.emailVerified),
      twoFactorEnabled: Boolean(user.useTotp),
      passwordResetRequired: Boolean(user.passwordResetRequired),
      serversOwned: counts.owned,
      serversAccess: counts.accessible,
    };
  });

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.users.listed',
    targetType: 'user',
    metadata: {
      page,
      limit,
      total,
      returned: users.length,
    },
  });

  return {
    data: users,
    pagination: {
      page,
      perPage: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
