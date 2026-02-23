import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { desc } from 'drizzle-orm';
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

  const [servers, apiKeys, sessions, allActivityEvents] = await Promise.all([
    // Servers query
    db
      .select({
        id: tables.servers.id,
        uuid: tables.servers.uuid,
        identifier: tables.servers.identifier,
        name: tables.servers.name,
        status: tables.servers.status,
        suspended: tables.servers.suspended,
        createdAt: tables.servers.createdAt,
        nodeName: tables.wingsNodes.name,
      })
      .from(tables.servers)
      .leftJoin(tables.wingsNodes, eq(tables.servers.nodeId, tables.wingsNodes.id))
      .where(eq(tables.servers.ownerId, user.id))
      .orderBy(desc(tables.servers.createdAt)),

    // API keys query
    db
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
      .orderBy(desc(tables.apiKeys.createdAt)),

    // Sessions query
    db
      .select({
        sessionToken: tables.sessions.sessionToken,
        expires: tables.sessions.expires,
        expiresAt: tables.sessions.expiresAt,
        sessionIpAddress: tables.sessions.ipAddress,
        metadataIpAddress: tables.sessionMetadata.ipAddress,
        lastSeenAt: tables.sessionMetadata.lastSeenAt,
        firstSeenAt: tables.sessionMetadata.firstSeenAt,
        userAgent: tables.sessionMetadata.userAgent,
      })
      .from(tables.sessions)
      .leftJoin(
        tables.sessionMetadata,
        eq(tables.sessions.sessionToken, tables.sessionMetadata.sessionToken),
      )
      .where(eq(tables.sessions.userId, user.id))
      .orderBy(desc(tables.sessions.expiresAt)),

    // All activity events query
    db
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
      .limit(100),
  ]);

  const securityEvents = allActivityEvents
    .filter((event) => {
      const action = event.action.toLowerCase();
      return (
        action.includes('login') ||
        action.includes('sign') ||
        action.includes('password') ||
        action.includes('2fa') ||
        action.includes('two_factor') ||
        action.includes('security') ||
        action.includes('session')
      );
    })
    .slice(0, 5);

  const formatTimestamp = (value: number | Date | null | undefined) => {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
  };

  const parseMetadata = (value: string | null): Record<string, unknown> => {
    if (!value) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(value);
      if (isRecord(parsed)) {
        return parsed;
      }
      return { value: parsed };
    } catch {
      return { raw: value };
    }
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
        serverCount: servers.length,
        apiKeyCount: apiKeys.length,
      },
      servers: servers.map((server) => ({
        id: server.id,
        uuid: server.uuid,
        identifier: server.identifier,
        name: server.name,
        status: server.status,
        suspended: Boolean(server.suspended),
        nodeName: server.nodeName ?? null,
        createdAt: formatTimestamp(server.createdAt)!,
      })),
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        identifier: key.identifier,
        memo: key.memo,
        createdAt: formatTimestamp(key.createdAt)!,
        lastUsedAt: formatTimestamp(key.lastUsedAt),
        expiresAt: formatTimestamp(key.expiresAt),
      })),
      activity: allActivityEvents.map((entry) => ({
        id: entry.id,
        occurredAt: formatTimestamp(entry.occurredAt)!,
        action: entry.action,
        target: entry.targetId ? `${entry.targetType}#${entry.targetId}` : entry.targetType,
        actor: entry.actor,
        details: parseMetadata(entry.metadata ?? null),
      })),
      security: {
        sessions: sessions.map((session) => {
          const ipAddress = session.metadataIpAddress || session.sessionIpAddress || null;

          let expiresDate: Date | null = null;
          if (session.expiresAt) {
            expiresDate =
              session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt);
          } else if (session.expires) {
            if (session.expires instanceof Date) {
              expiresDate = session.expires;
            } else if (typeof session.expires === 'number') {
              expiresDate =
                String(session.expires).length <= 10
                  ? new Date(session.expires * 1000)
                  : new Date(session.expires);
            }
          }

          return {
            sessionToken: session.sessionToken,
            expiresAt: formatTimestamp(expiresDate),
            ipAddress,
            lastSeenAt: formatTimestamp(session.lastSeenAt),
            userAgent: session.userAgent ?? null,
          };
        }),
        lastLogin: (() => {
          const allSessions = sessions
            .map((s) => ({
              lastSeenAt:
                s.lastSeenAt instanceof Date
                  ? s.lastSeenAt
                  : s.lastSeenAt
                    ? new Date(s.lastSeenAt)
                    : null,
              firstSeenAt:
                s.firstSeenAt instanceof Date
                  ? s.firstSeenAt
                  : s.firstSeenAt
                    ? new Date(s.firstSeenAt)
                    : null,
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
                s.lastSeenAt instanceof Date
                  ? s.lastSeenAt
                  : s.lastSeenAt
                    ? new Date(s.lastSeenAt)
                    : null,
              firstSeenAt:
                s.firstSeenAt instanceof Date
                  ? s.firstSeenAt
                  : s.firstSeenAt
                    ? new Date(s.firstSeenAt)
                    : null,
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
            s.expiresAt instanceof Date
              ? s.expiresAt
              : s.expires instanceof Date
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
        securityEvents: securityEvents.map((event) => ({
          id: event.id,
          occurredAt: formatTimestamp(event.occurredAt)!,
          action: event.action,
          details: parseMetadata(event.metadata ?? null),
        })),
      },
    },
  };
});
