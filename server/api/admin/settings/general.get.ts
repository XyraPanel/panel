import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { SETTINGS_KEYS, getSetting, getSettingWithDefault } from '~~/server/utils/settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const name = getSettingWithDefault(SETTINGS_KEYS.PANEL_NAME, 'XyraPanel')
  const brandText = getSetting(SETTINGS_KEYS.BRAND_TEXT) ?? name
  const showTextSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_TEXT)
  const showLogoSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO)
  const logoPath = getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH)

  return {
    name,
    url: getSettingWithDefault(SETTINGS_KEYS.PANEL_URL, 'http://localhost:3000'),
    locale: getSettingWithDefault(SETTINGS_KEYS.PANEL_LOCALE, 'en'),
    timezone: getSettingWithDefault(SETTINGS_KEYS.PANEL_TIMEZONE, 'UTC'),
    brandText,
    showBrandText: showTextSetting ? showTextSetting === 'true' : true,
    showBrandLogo: showLogoSetting ? showLogoSetting === 'true' : false,
    brandLogoUrl: logoPath ?? null,
  }
})
