import { SETTINGS_KEYS, getSetting } from '#server/utils/settings';

const DEFAULT_BRAND_LOGO = '/logo.png';

export default defineEventHandler(async () => {
  const showLogoSetting = await getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO);
  const logoPath = await getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH);

  return {
    showBrandLogo: showLogoSetting ? showLogoSetting === 'true' : true,
    brandLogoUrl: logoPath ?? DEFAULT_BRAND_LOGO,
  };
});
