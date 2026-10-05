import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { SETTINGS_KEYS, setSettings } from '#server/utils/settings';
import { refreshEmailService } from '#server/utils/email';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { mailSettingsSchema } from '#shared/schema/admin/settings';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Update mail settings',
    description:
      'Partially updates SMTP/mail configuration and refreshes the mail transport. Requires an admin session with the panel_settings:write ACL permission.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              driver: { type: 'string' },
              service: { type: 'string' },
              host: { type: 'string' },
              port: { type: 'integer' },
              username: { type: 'string' },
              password: { type: 'string' },
              encryption: { type: 'string' },
              fromAddress: { type: 'string', format: 'email' },
              fromName: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Mail settings updated',
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
      '400': { description: 'No settings to update, or invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:write ACL permission' },
      '500': { description: 'Failed to update mail settings' },
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

  const body = await readValidatedBodyWithLimit(event, mailSettingsSchema, BODY_SIZE_LIMITS.SMALL);
  const updates: Record<string, string> = {};

  if (body.driver !== undefined) {
    updates[SETTINGS_KEYS.MAIL_DRIVER] = body.driver;
  }

  if (body.service !== undefined) {
    updates[SETTINGS_KEYS.MAIL_SERVICE] = body.service;
  }

  if (body.host !== undefined) {
    updates[SETTINGS_KEYS.MAIL_HOST] = body.host;
  }

  if (body.port !== undefined) {
    updates[SETTINGS_KEYS.MAIL_PORT] = String(body.port);
  }

  if (body.username !== undefined) {
    updates[SETTINGS_KEYS.MAIL_USERNAME] = body.username;
  }

  if (body.password !== undefined) {
    updates[SETTINGS_KEYS.MAIL_PASSWORD] = body.password;
  }

  if (body.encryption !== undefined) {
    updates[SETTINGS_KEYS.MAIL_ENCRYPTION] = body.encryption;
  }

  if (body.fromAddress !== undefined) {
    updates[SETTINGS_KEYS.MAIL_FROM_ADDRESS] = body.fromAddress;
  }

  if (body.fromName !== undefined) {
    updates[SETTINGS_KEYS.MAIL_FROM_NAME] = body.fromName;
  }

  const updatedKeys = Object.keys(updates);

  if (updatedKeys.length === 0) {
    throw createError({
      status: 400,
      message: 'No settings to update',
    });
  }

  try {
    await setSettings(updates as Record<(typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS], string>);

    void refreshEmailService();

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.settings.mail.updated',
      targetType: 'settings',
      metadata: { updatedKeys },
    });

    return {
      data: {
        success: true,
        updatedKeys,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Mail Settings] Update failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to update mail settings',
    });
  }
});
