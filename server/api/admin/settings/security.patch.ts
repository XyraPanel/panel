import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { SETTINGS_KEYS, setSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { securitySettingsSchema } from '#shared/schema/admin/settings';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

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
});
