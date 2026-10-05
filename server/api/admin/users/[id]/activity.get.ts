import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { z } from 'zod';
import { desc, count } from 'drizzle-orm';
import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Users'],
    summary: 'List a user\'s activity log',
    description:
      'Returns a paginated list of audit events attributed to the target user (matched by ID, email, or username). Requires an admin session with the users:read ACL permission.',
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
        description: 'Paginated activity log',
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
                      occurredAt: { type: 'string', format: 'date-time' },
                      action: { type: 'string' },
                      target: { type: 'string', nullable: true },
                      actor: { type: 'string' },
                      details: { type: 'object' },
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
  await requireAdmin(event);
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

  const formatTimestamp = (value: number | Date | string | null | undefined) => {
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
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
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
      occurredAt: formatTimestamp(entry.occurredAt) || new Date().toISOString(),
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
