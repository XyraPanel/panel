import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { SETTINGS_KEYS, setSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { securitySettingsSchema } from '#shared/schema/admin/settings';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Update security settings',
    description:
      'Partially updates 2FA enforcement, maintenance mode, announcement, session timeout, and queue settings. Requires an admin session with the panel_settings:write ACL permission.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              enforceTwoFactor: { type: 'boolean' },
              maintenanceMode: { type: 'boolean' },
              maintenanceMessage: { type: 'string', nullable: true },
              announcementEnabled: { type: 'boolean' },
              announcementMessage: { type: 'string', nullable: true },
              sessionTimeoutMinutes: { type: 'integer' },
              queueConcurrency: { type: 'integer' },
              queueRetryLimit: { type: 'integer' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Security settings updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    updatedKeys: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'No settings provided, or invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:write ACL permission' },
      '500': { description: 'Failed to update security settings' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    securitySettingsSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const updates: Record<string, string> = {};

  if (body.enforceTwoFactor !== undefined) {
    updates[SETTINGS_KEYS.ENFORCE_TWO_FACTOR] = body.enforceTwoFactor ? 'true' : 'false';
  }

  if (body.maintenanceMode !== undefined) {
    updates[SETTINGS_KEYS.MAINTENANCE_MODE] = body.maintenanceMode ? 'true' : 'false';
  }

  if (body.maintenanceMessage !== undefined) {
    updates[SETTINGS_KEYS.MAINTENANCE_MESSAGE] = body.maintenanceMessage ?? '';
  }

  if (body.announcementEnabled !== undefined) {
    updates[SETTINGS_KEYS.ANNOUNCEMENT_ENABLED] = body.announcementEnabled ? 'true' : 'false';
  }

  if (body.announcementMessage !== undefined) {
    updates[SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE] = body.announcementMessage ?? '';
  }

  if (body.sessionTimeoutMinutes !== undefined) {
    updates[SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES] = String(body.sessionTimeoutMinutes);
  }

  if (body.queueConcurrency !== undefined) {
    updates[SETTINGS_KEYS.QUEUE_CONCURRENCY] = String(body.queueConcurrency);
  }

  if (body.queueRetryLimit !== undefined) {
    updates[SETTINGS_KEYS.QUEUE_RETRY_LIMIT] = String(body.queueRetryLimit);
  }

  if (Object.keys(updates).length === 0) {
    throw createError({
      status: 400,
      message: 'No settings provided',
    });
  }

  try {
    await setSettings(updates as Record<(typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS], string>);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.settings.security.updated',
      targetType: 'settings',
      metadata: {
        updatedKeys: Object.keys(updates),
      },
    });

    return {
      data: {
        success: true,
        updatedKeys: Object.keys(updates),
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Security Settings Patch] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to update security settings',
    });
  }
});
