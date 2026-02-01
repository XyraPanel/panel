import { requireAdmin } from '#server/utils/security'
import { SETTINGS_KEYS, getSetting, getSettingWithDefault } from '#server/utils/settings'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  const showLogoSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO)
  const logoPath = getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH)

  const data = {
    locale: getSettingWithDefault(SETTINGS_KEYS.PANEL_LOCALE, 'en'),
    timezone: getSettingWithDefault(SETTINGS_KEYS.PANEL_TIMEZONE, 'UTC'),
    showBrandLogo: showLogoSetting ? showLogoSetting === 'true' : false,
    brandLogoUrl: logoPath ?? null,
    paginationLimit: parseInt(getSetting(SETTINGS_KEYS.PAGINATION_LIMIT) ?? '25', 10),
    telemetryEnabled: getSettingWithDefault(SETTINGS_KEYS.TELEMETRY_ENABLED, 'true') === 'true',
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.general.viewed',
    targetType: 'settings',
  })

  return {
    data,
  }
})
