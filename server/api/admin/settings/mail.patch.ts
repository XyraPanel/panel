import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { SETTINGS_KEYS, setSettings } from '#server/utils/settings';
import { refreshEmailService } from '#server/utils/email';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { mailSettingsSchema } from '#shared/schema/admin/settings';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

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

  await setSettings(updates as Record<(typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS], string>);

  refreshEmailService();

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
});
