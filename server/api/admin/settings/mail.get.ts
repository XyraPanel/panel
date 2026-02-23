import { requireAdmin } from '#server/utils/security';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const s = await getSettings([
    SETTINGS_KEYS.MAIL_DRIVER,
    SETTINGS_KEYS.MAIL_SERVICE,
    SETTINGS_KEYS.MAIL_HOST,
    SETTINGS_KEYS.MAIL_PORT,
    SETTINGS_KEYS.MAIL_USERNAME,
    SETTINGS_KEYS.MAIL_PASSWORD,
    SETTINGS_KEYS.MAIL_ENCRYPTION,
    SETTINGS_KEYS.MAIL_FROM_ADDRESS,
    SETTINGS_KEYS.MAIL_FROM_NAME,
  ]);

  const appName = useRuntimeConfig().public.appName || 'XyraPanel';
  const data = {
    driver: s[SETTINGS_KEYS.MAIL_DRIVER] ?? 'smtp',
    service: s[SETTINGS_KEYS.MAIL_SERVICE] ?? '',
    host: s[SETTINGS_KEYS.MAIL_HOST] ?? 'localhost',
    port: s[SETTINGS_KEYS.MAIL_PORT] ?? '587',
    username: s[SETTINGS_KEYS.MAIL_USERNAME] ?? '',
    password: s[SETTINGS_KEYS.MAIL_PASSWORD] ?? '',
    encryption: s[SETTINGS_KEYS.MAIL_ENCRYPTION] ?? 'tls',
    fromAddress: s[SETTINGS_KEYS.MAIL_FROM_ADDRESS] ?? 'noreply@xyrapanel.local',
    fromName: s[SETTINGS_KEYS.MAIL_FROM_NAME] ?? appName,
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.mail.viewed',
    targetType: 'settings',
  });

  return {
    data,
  };
});
