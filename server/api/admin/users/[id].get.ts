import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { count, desc } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

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

  const db = useDrizzle();

  const userResult = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
      language: tables.users.language,
      rootAdmin: tables.users.rootAdmin,
      role: tables.users.role,
      useTotp: tables.users.useTotp,
      totpAuthenticatedAt: tables.users.totpAuthenticatedAt,
      emailVerified: tables.users.emailVerified,
      banned: tables.users.banned,
      banReason: tables.users.banReason,
      banExpires: tables.users.banExpires,
      passwordResetRequired: tables.users.passwordResetRequired,
      createdAt: tables.users.createdAt,
      updatedAt: tables.users.updatedAt,
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

  const [serverCountResult, apiKeyCountResult, activityCountResult, sessions] = await Promise.all([
    db.select({ count: count() }).from(tables.servers).where(eq(tables.servers.ownerId, user.id)),
    db.select({ count: count() }).from(tables.apiKeys).where(eq(tables.apiKeys.userId, user.id)),
    db.select({ count: count() }).from(tables.auditEvents).where(or(...activityConditions)),
    db
      .select({
        expires: tables.sessions.expires,
        expiresAt: tables.sessions.expiresAt,
        sessionIpAddress: tables.sessions.ipAddress,
        metadataIpAddress: tables.sessionMetadata.ipAddress,
        lastSeenAt: tables.sessionMetadata.lastSeenAt,
        firstSeenAt: tables.sessionMetadata.firstSeenAt,
      })
      .from(tables.sessions)
      .leftJoin(
        tables.sessionMetadata,
        eq(tables.sessions.sessionToken, tables.sessionMetadata.sessionToken),
      )
      .where(eq(tables.sessions.userId, user.id))
      .orderBy(desc(tables.sessions.expiresAt)),
  ]);
  const serverCount = serverCountResult[0]?.count ?? 0;
  const apiKeyCount = apiKeyCountResult[0]?.count ?? 0;
  const activityCount = activityCountResult[0]?.count ?? 0;

  const isDateObject = (value: unknown): value is Date => value instanceof Date;

  const toDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) {
      return null;
    }

    if (isDateObject(value)) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatTimestamp = (value: string | number | Date | null | undefined) => {
    const date = toDate(value);
    return date ? date.toISOString() : null;
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.user.viewed',
    targetType: 'user',
    targetId: id,
  });

  return {
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.nameFirst ?? null,
        lastName: user.nameLast ?? null,
        name:
          user.nameFirst || user.nameLast
            ? `${user.nameFirst ?? ''} ${user.nameLast ?? ''}`.trim() || null
            : null,
        language: user.language,
        role: user.role,
        rootAdmin: Boolean(user.rootAdmin),
        twoFactorEnabled: Boolean(user.useTotp),
        emailVerified: Boolean(user.emailVerified),
        emailVerifiedAt: formatTimestamp(user.emailVerified),
        suspended: Boolean(user.banned),
        suspendedAt: formatTimestamp(user.banExpires),
        suspensionReason: user.banReason ?? null,
        passwordResetRequired: Boolean(user.passwordResetRequired),
        createdAt: formatTimestamp(user.createdAt)!,
        updatedAt: formatTimestamp(user.updatedAt)!,
      },
      stats: {
        serverCount,
        apiKeyCount,
        activityCount,
      },
      security: {
        lastLogin: (() => {
          const allSessions = sessions
            .map((s) => ({
              lastSeenAt:
                toDate(s.lastSeenAt),
              firstSeenAt:
                toDate(s.firstSeenAt),
            }))
            .filter((s) => s.lastSeenAt || s.firstSeenAt);

          if (allSessions.length === 0) return null;

          const mostRecent = allSessions.reduce((latest, current) => {
            const currentTime = (current.lastSeenAt || current.firstSeenAt)?.getTime() || 0;
            const latestTime = (latest.lastSeenAt || latest.firstSeenAt)?.getTime() || 0;
            return currentTime > latestTime ? current : latest;
          });

          return formatTimestamp(mostRecent.lastSeenAt || mostRecent.firstSeenAt);
        })(),
        lastLoginIp: (() => {
          const sessionsWithTime = sessions
            .map((s) => ({
              ipAddress: s.metadataIpAddress || s.sessionIpAddress || null,
              lastSeenAt:
                toDate(s.lastSeenAt),
              firstSeenAt:
                toDate(s.firstSeenAt),
            }))
            .filter((s) => s.ipAddress && (s.lastSeenAt || s.firstSeenAt));

          if (sessionsWithTime.length === 0) return null;

          const mostRecent = sessionsWithTime.reduce((latest, current) => {
            const currentTime = (current.lastSeenAt || current.firstSeenAt)?.getTime() || 0;
            const latestTime = (latest.lastSeenAt || latest.firstSeenAt)?.getTime() || 0;
            return currentTime > latestTime ? current : latest;
          });

          return mostRecent.ipAddress;
        })(),
        uniqueIps: (() => {
          const allIps = sessions
            .map((s) => s.metadataIpAddress || s.sessionIpAddress)
            .filter((ip): ip is string => typeof ip === 'string' && ip.length > 0);
          return [...new Set(allIps)];
        })(),
        activeSessions: sessions.filter((s) => {
          if (!s.expires && !s.expiresAt) return false;
          const expires =
            isDateObject(s.expiresAt)
              ? s.expiresAt
              : isDateObject(s.expires)
                ? s.expires
                : typeof s.expires === 'number'
                  ? String(s.expires).length <= 10
                    ? new Date(s.expires * 1000)
                    : new Date(s.expires)
                  : s.expiresAt
                    ? new Date(s.expiresAt)
                  : null;
          return expires && expires > new Date();
        }).length,
      },
    },
  };
});
