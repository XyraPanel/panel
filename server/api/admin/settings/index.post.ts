import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { adminSettingsPayloadSchema } from '#shared/schema/admin/settings';
import { SETTINGS_KEYS } from '#server/utils/settings';

const WRITABLE_SETTINGS_KEYS = new Set<string>(Object.values(SETTINGS_KEYS));

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Bulk update panel settings',
    description:
      'Sets, updates, or deletes (via null value) an arbitrary map of known settings keys. Requires an admin session with the panel_settings:write ACL permission.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: { type: ['string', 'number', 'boolean', 'null'] },
            description: 'Map of setting key to new value (null deletes the key)',
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Settings updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    updatedKeys: { type: 'array', items: { type: 'string' } },
                    deletedKeys: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'One or more unknown setting keys, or invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:write ACL permission' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    adminSettingsPayloadSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const db = useDrizzle();

  const invalidKeys = Object.keys(body).filter((key) => !WRITABLE_SETTINGS_KEYS.has(key));
  if (invalidKeys.length > 0) {
    throw createError({
      status: 400,
      message: `Unknown setting key(s): ${invalidKeys.join(', ')}`,
    });
  }

  const updatedKeys: string[] = [];
  const deletedKeys: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (value === null) {
      await db.delete(tables.settings).where(eq(tables.settings.key, key));
      deletedKeys.push(key);
      continue;
    }

    const [existing] = await db
      .select()
      .from(tables.settings)
      .where(eq(tables.settings.key, key))
      .limit(1);

    const stringValue = String(value);

    if (existing) {
      await db
        .update(tables.settings)
        .set({ value: stringValue })
        .where(eq(tables.settings.key, key));
    } else {
      await db.insert(tables.settings).values({ key, value: stringValue });
    }
    updatedKeys.push(key);
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.bulk_updated',
    targetType: 'settings',
    metadata: {
      updatedKeys,
      deletedKeys,
    },
  });

  return {
    data: {
      success: true,
      message: 'Settings updated successfully',
      updatedKeys,
      deletedKeys,
    },
  };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
