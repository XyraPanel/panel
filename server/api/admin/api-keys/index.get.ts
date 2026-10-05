import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - API Keys'],
    summary: 'List admin API keys',
    description:
      'Returns all admin API keys with their identifiers and usage metadata (key secrets are never returned). Requires an admin session with the api-keys:read ACL permission.',
    responses: {
      '200': {
        description: 'List of admin API keys',
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
                      identifier: { type: 'string' },
                      memo: { type: 'string', nullable: true },
                      lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                      expiresAt: { type: 'string', format: 'date-time', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing api-keys:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.API_KEYS,
    ADMIN_ACL_PERMISSIONS.READ,
  );
  const db = useDrizzle();

  const keys = await db
    .select({
      id: tables.apiKeys.id,
      identifier: tables.apiKeys.identifier,
      start: tables.apiKeys.start,
      memo: tables.apiKeys.memo,
      name: tables.apiKeys.name,
      lastUsedAt: tables.apiKeys.lastUsedAt,
      expiresAt: tables.apiKeys.expiresAt,
      createdAt: tables.apiKeys.createdAt,
    })
    .from(tables.apiKeys)
    .orderBy(tables.apiKeys.createdAt);

  const data = keys.map(
    (key: {
      id: string;
      identifier: string | null;
      start: string | null;
      memo: string | null;
      name: string | null;
      lastUsedAt: string | null;
      expiresAt: string | null;
      createdAt: string;
    }) => ({
      id: key.id,
      identifier: key.identifier || key.start || key.id,
      memo: key.memo || key.name || null,
      lastUsedAt: key.lastUsedAt || null,
      expiresAt: key.expiresAt || null,
      createdAt: key.createdAt,
    }),
  );

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.api_key.listed',
    targetType: 'api_key',
    metadata: {
      count: data.length,
    },
  });

  return {
    data,
  };
});
