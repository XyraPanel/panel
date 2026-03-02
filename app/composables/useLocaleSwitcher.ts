import { computed } from 'vue';

export function useLocaleSwitcher() {
  const { locale, locales } = useI18n();
  const route = useRoute();
  const switchLocalePath = useSwitchLocalePath();

  const uiLocales = computed(() => {
    return locales.value.map((loc) => {
      const dir = typeof loc === 'string' ? 'ltr' : loc.dir || 'ltr';
      return {
        code: typeof loc === 'string' ? loc : loc.code,
        name: typeof loc === 'string' ? loc : loc.name || loc.code,
        language: typeof loc === 'string' ? loc : loc.language || loc.code,
        dir: (dir === 'auto' ? 'ltr' : dir),
        messages: {},
      };
    });
  });

  const localeFlagMap: Record<string, string> = {
    en: '🇺🇸',
    'en-US': '🇺🇸',
    'en-GB': '🇬🇧',
    es: '🇪🇸',
    de: '🇩🇪',
    fr: '🇫🇷',
    it: '🇮🇹',
    nl: '🇳🇱',
    ar: '🇸🇦',
    el: '🇬🇷',
    tr: '🇹🇷',
  };

  function localeToFlag(code?: string): string {
    if (!code) return '🌐';
    if (localeFlagMap[code]) return localeFlagMap[code];
    const parts = code.split('-');
    if (parts.length === 0) return '🌐';
    const region = parts[parts.length - 1]?.toUpperCase();
    if (region && region.length === 2) {
      const base = 0x1f1e6;
      const offsetA = 'A'.charCodeAt(0);
      return String.fromCodePoint(
        region.charCodeAt(0) - offsetA + base,
        region.charCodeAt(1) - offsetA + base,
      );
    }
    return '🌐';
  }

  const currentFlag = computed(() => localeToFlag(locale.value));
  const localeDropdownItems = computed(() => [
    uiLocales.value.map((loc) => ({
      label: loc.name || loc.language || loc.code,
      active: loc.code === locale.value,
      click: () => handleLocaleChange(loc.code),
    })),
  ]);

  async function handleLocaleChange(newLocale: string | undefined) {
    if (!newLocale || newLocale === locale.value) return;

    const validLocale = locales.value.find((l) => {
      const code = typeof l === 'string' ? l : l.code;
      return code === newLocale;
    });

    if (!validLocale) return;

    const code = typeof validLocale === 'string' ? validLocale : validLocale.code;
    const path = switchLocalePath(code);
    if (!path) return;

    const needsTrailingSlash = path.split('/').filter(Boolean).length === 1 && route.path === '/';
    const normalizedPath = needsTrailingSlash && !path.endsWith('/') ? `${path}/` : path;
    await navigateTo(normalizedPath);
  }

  return {
    locale,
    uiLocales,
    currentFlag,
    localeDropdownItems,
    handleLocaleChange,
  };
}
