import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { z } from 'zod';
import { count, desc } from 'drizzle-orm';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'List SSH keys',
    description: 'Retrieves a paginated list of all SSH public keys registered for the authenticated user\'s account.',
    parameters: [
      {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', default: 1 },
        description: 'Page number for pagination',
      },
      {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', default: 50, maximum: 100 },
        description: 'Number of items per page',
      },
    ],
    responses: {
      200: {
        description: 'SSH keys successfully retrieved',
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
                      name: { type: 'string' },
                      fingerprint: { type: 'string' },
                      public_key: { type: 'string' },
                      created_at: { type: 'string', format: 'date-time' },
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
      401: { description: 'Authentication required' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const db = useDrizzle();
  const { page, limit } = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().min(1).catch(1).default(1),
      limit: z.coerce.number().min(1).max(100).catch(50).default(50),
    }),
  );
  const offset = (page - 1) * limit;

  const totalResult = await db
    .select({ count: count() })
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.userId, user.id));
  const total = totalResult[0]?.count ?? 0;

  const keys = await db
    .select({
      id: tables.sshKeys.id,
      name: tables.sshKeys.name,
      fingerprint: tables.sshKeys.fingerprint,
      publicKey: tables.sshKeys.publicKey,
      createdAt: tables.sshKeys.createdAt,
    })
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.userId, user.id))
    .orderBy(desc(tables.sshKeys.createdAt))
    .limit(limit)
    .offset(offset);

  const data = keys.map((key) => ({
    id: key.id,
    name: key.name,
    fingerprint: key.fingerprint,
    public_key: key.publicKey,
    created_at: key.createdAt,
  }));

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.ssh_keys.listed',
    targetType: 'user',
    targetId: user.id,
    metadata: { page, limit, total, returned: keys.length },
  });

  return {
    data,
    pagination: {
      page,
      perPage: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
