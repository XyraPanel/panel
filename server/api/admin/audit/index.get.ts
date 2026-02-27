import { count, desc, eq, like, or, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.AUDIT, ADMIN_ACL_PERMISSIONS.READ);

  const { page, limit, search, actor, action, targetType } = await getValidatedQuery(event, (data) => {
    const result = z.object({
      page: z.coerce.number().min(1).catch(1).default(1),
      limit: z.coerce.number().min(1).max(100).catch(50).default(50),
      search: z.string().optional(),
      actor: z.string().optional(),
      action: z.string().optional(),
      targetType: z.string().optional(),
    }).safeParse(data);
    return result.success ? result.data : { page: 1, limit: 50 };
  });
  const offset = (page - 1) * limit;

  const db = useDrizzle();

  const conditions = [] as Array<ReturnType<typeof and> | ReturnType<typeof eq>>;

  if (search) {
    conditions.push(
      or(
        like(tables.auditEvents.actor, `%${search}%`),
        like(tables.auditEvents.action, `%${search}%`),
        like(tables.auditEvents.targetId, `%${search}%`),
      ),
    );
  }

  if (actor) {
    conditions.push(eq(tables.auditEvents.actor, actor));
  }

  if (action) {
    conditions.push(eq(tables.auditEvents.action, action));
  }

  if (targetType) {
    conditions.push(eq(tables.auditEvents.targetType, targetType));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ total: count() })
    .from(tables.auditEvents)
    .where(whereClause);

  const total = countResult[0]?.total ?? 0;

  const events = await db
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
    .where(whereClause)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .offset(offset);

  const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate);

  const parseMetadata = (value: string | null) => {
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

  const transformTimestamp = (raw: Date | number | string) => {
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  };

  const actorIds = new Set<string>();
  const actorEmails = new Set<string>();

  events.forEach((auditEvent) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(auditEvent.actor)) {
      actorIds.add(auditEvent.actor);
    } else if (auditEvent.actor.includes('@')) {
      actorEmails.add(auditEvent.actor);
    }
  });

  const userMap = new Map<string, { id: string; username: string | null; email: string | null }>();

  if (actorIds.size > 0) {
    const userIds = Array.from(actorIds);
    if (userIds.length > 0) {
      const users = await db
        .select({
          id: tables.users.id,
          username: tables.users.username,
          email: tables.users.email,
        })
        .from(tables.users)
        .where(inArray(tables.users.id, userIds));

      users.forEach((user) => {
        userMap.set(user.id, { id: user.id, username: user.username, email: user.email });
        if (user.email) {
          userMap.set(user.email, { id: user.id, username: user.username, email: user.email });
        }
      });
    }
  }

  if (actorEmails.size > 0) {
    const emails = Array.from(actorEmails);
    for (const email of emails) {
      if (!userMap.has(email)) {
        const userResult = await db
          .select({
            id: tables.users.id,
            username: tables.users.username,
            email: tables.users.email,
          })
          .from(tables.users)
          .where(eq(tables.users.email, email))
          .limit(1);

        const user = userResult[0];
        if (user) {
          userMap.set(user.id, { id: user.id, username: user.username, email: user.email });
          userMap.set(email, { id: user.id, username: user.username, email: user.email });
        }
      }
    }
  }

  const response = {
    data: events.map((auditEvent) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      const userInfo = uuidRegex.test(auditEvent.actor)
        ? userMap.get(auditEvent.actor)
        : auditEvent.actor.includes('@')
          ? userMap.get(auditEvent.actor)
          : null;

      let formattedActorDisplay: string | undefined;
      if (userInfo) {
        const name = userInfo.username || userInfo.email || auditEvent.actor;
        const email = userInfo.email;
        formattedActorDisplay = email && email !== name ? `${name} (${email})` : name;
      }

      return {
        id: auditEvent.id,
        occurredAt: transformTimestamp(auditEvent.occurredAt),
        actor: auditEvent.actor,
        actorDisplay: formattedActorDisplay,
        actorUserId: userInfo?.id,
        actorEmail: userInfo?.email || undefined,
        action: auditEvent.action,
        target: auditEvent.targetId
          ? `${auditEvent.targetType}#${auditEvent.targetId}`
          : auditEvent.targetType,
        details: parseMetadata(auditEvent.metadata),
      };
    }),
    pagination: {
      page,
      perPage: limit,
      total,
      hasMore: offset + events.length < total,
    },
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.audit.viewed',
    targetType: 'settings',
    metadata: {
      page,
      limit,
      count: response.data.length,
      search: search ?? null,
      actor: actor ?? null,
      action: action ?? null,
      targetType: targetType ?? null,
    },
  });

  return response;
});
