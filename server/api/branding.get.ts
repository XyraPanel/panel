import { SETTINGS_KEYS, getSetting } from '#server/utils/settings';

const DEFAULT_BRAND_LOGO = '/logo.png';

defineRouteMeta({
  openAPI: {
    tags: ['System'],
    summary: 'Get branding settings',
    description: 'Retrieves current panel branding configurations, including logo visibility and asset URLs.',
    responses: {
      200: {
        description: 'Successfully retrieved branding settings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                showBrandLogo: { type: 'boolean' },
                brandLogoUrl: { type: 'string' },
              },
            },
          },
        },
      },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async () => {
  const showLogoSetting = await getSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO);
  const logoPath = await getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH);

  return {
    showBrandLogo: showLogoSetting ? showLogoSetting === 'true' : true,
    brandLogoUrl: logoPath ?? DEFAULT_BRAND_LOGO,
  };
});
