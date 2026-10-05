interface AddonNavItem {
  name: string;
  url: string;
  priority?: number;
}

/** Fetches addon-contributed navigation items for one of the panel's nav hooks. */
export function useAddonNav(area: 'navigation.dashboard' | 'navigation.account-dropdown') {
  return useFetch<{ items: AddonNavItem[] }>('/api/admin/addons/nav', {
    key: `addon-nav-${area}`,
    query: { area },
    default: () => ({ items: [] }),
  });
}
