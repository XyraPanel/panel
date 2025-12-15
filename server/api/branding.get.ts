import type { GeneralSettings } from '#shared/types/admin'
import { SETTINGS_KEYS, getSetting, getSettingWithDefault } from '~~/server/utils/settings'

type BrandingSettings = Pick<GeneralSettings, 'name' | 'showBrandLogo' | 'brandLogoUrl'>

export default defineEventHandler((): BrandingSettings => {
  const name = getSettingWithDefault(SETTINGS_KEYS.PANEL_NAME, 'XyraPanel')
  const showLogoSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO)
  const logoPath = getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH)

  const showBrandLogo = showLogoSetting ? showLogoSetting === 'true' : false

  return {
    name,
    showBrandLogo,
    brandLogoUrl: logoPath ?? null,
  }
})
