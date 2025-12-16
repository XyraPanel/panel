import type { GeneralSettings } from '#shared/types/admin'
import { SETTINGS_KEYS, getSetting } from '~~/server/utils/settings'

type BrandingSettings = Pick<GeneralSettings, 'showBrandLogo' | 'brandLogoUrl'>

export default defineEventHandler((): BrandingSettings => {
  const showLogoSetting = getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO)
  const logoPath = getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH)

  const showBrandLogo = showLogoSetting ? showLogoSetting === 'true' : false

  return {
    showBrandLogo,
    brandLogoUrl: logoPath ?? null,
  }
})
