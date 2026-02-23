import { requireAdmin } from '#server/utils/security';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const s = await getSettings([
    SETTINGS_KEYS.PANEL_LOCALE,
    SETTINGS_KEYS.PANEL_TIMEZONE,
    SETTINGS_KEYS.BRAND_SHOW_LOGO,
    SETTINGS_KEYS.BRAND_LOGO_PATH,
    SETTINGS_KEYS.PAGINATION_LIMIT,
    SETTINGS_KEYS.TELEMETRY_ENABLED,
  ]);

  const data = {
    locale: s[SETTINGS_KEYS.PANEL_LOCALE] ?? 'en',
    timezone: s[SETTINGS_KEYS.PANEL_TIMEZONE] ?? 'UTC',
    showBrandLogo: s[SETTINGS_KEYS.BRAND_SHOW_LOGO] === 'true',
    brandLogoUrl: s[SETTINGS_KEYS.BRAND_LOGO_PATH] ?? null,
    paginationLimit: parseInt(s[SETTINGS_KEYS.PAGINATION_LIMIT] ?? '25', 10),
    telemetryEnabled: (s[SETTINGS_KEYS.TELEMETRY_ENABLED] ?? 'true') === 'true',
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.general.viewed',
    targetType: 'settings',
  });

  return {
    data,
  };
});
