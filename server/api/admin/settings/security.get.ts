import { requireAdmin } from '#server/utils/security';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { SecuritySettings } from '#shared/types/admin';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const s = await getSettings([
    SETTINGS_KEYS.ENFORCE_TWO_FACTOR,
    SETTINGS_KEYS.MAINTENANCE_MODE,
    SETTINGS_KEYS.MAINTENANCE_MESSAGE,
    SETTINGS_KEYS.ANNOUNCEMENT_ENABLED,
    SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE,
    SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES,
    SETTINGS_KEYS.QUEUE_CONCURRENCY,
    SETTINGS_KEYS.QUEUE_RETRY_LIMIT,
  ]);

  const data: SecuritySettings = {
    enforceTwoFactor: s[SETTINGS_KEYS.ENFORCE_TWO_FACTOR] === 'true',
    maintenanceMode: s[SETTINGS_KEYS.MAINTENANCE_MODE] === 'true',
    maintenanceMessage: s[SETTINGS_KEYS.MAINTENANCE_MESSAGE] ?? '',
    announcementEnabled: s[SETTINGS_KEYS.ANNOUNCEMENT_ENABLED] === 'true',
    announcementMessage: s[SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE] ?? '',
    sessionTimeoutMinutes: parseInt(s[SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES] ?? '60', 10),
    queueConcurrency: parseInt(s[SETTINGS_KEYS.QUEUE_CONCURRENCY] ?? '4', 10),
    queueRetryLimit: parseInt(s[SETTINGS_KEYS.QUEUE_RETRY_LIMIT] ?? '5', 10),
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.security.viewed',
    targetType: 'settings',
  });

  return {
    data,
  };
});
