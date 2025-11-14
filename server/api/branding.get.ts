import type { BrandingSettings } from '#shared/types/branding'
import { SETTINGS_KEYS, getSetting, getSettingWithDefault } from '~~/server/utils/settings'

export default defineEventHandler((): BrandingSettings => {
  const name = getSettingWithDefault(SETTINGS_KEYS.PANEL_NAME, 'XyraPanel')
  const brandTextSetting = getSetting(SETTINGS_KEYS.BRAND_TEXT)
  const showTextSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_TEXT)
  const showLogoSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO)
  const logoPath = getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH)

  const showBrandText = showTextSetting ? showTextSetting === 'true' : true
  const showBrandLogo = showLogoSetting ? showLogoSetting === 'true' : false

  return {
    brandText: brandTextSetting?.length ? brandTextSetting : name,
    showBrandText: showBrandText || !showBrandLogo,
    showBrandLogo,
    brandLogoUrl: logoPath ?? null,
  }
})
