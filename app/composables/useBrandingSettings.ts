export const useBrandingSettings = () => {
  return useFetch('/api/branding', {
    key: 'branding-settings',
    default: () =>
      ({
        showBrandLogo: true,
        brandLogoUrl: '/logo.png',
      }) as { showBrandLogo: boolean; brandLogoUrl: string | null },
  });
};
