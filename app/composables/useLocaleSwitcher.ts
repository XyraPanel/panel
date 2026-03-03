import { computed } from 'vue';
import * as uiLocaleCatalog from '@nuxt/ui/locale';

type UiLocaleOption = {
  code: string;
  name?: string;
  language?: string;
  dir?: 'ltr' | 'rtl';
};

export function useLocaleSwitcher() {
  const { locale, locales } = useI18n();
  const route = useRoute();
  const switchLocalePath = useSwitchLocalePath();

  const catalogLocales = computed(() => Object.values(uiLocaleCatalog));

  const isLocaleRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const extractLocaleString = (source: unknown, key: keyof UiLocaleOption): string | undefined => {
    if (!isLocaleRecord(source)) return undefined;
    const value = source[key as string];
    return typeof value === 'string' ? value : undefined;
  };

  const uiLocales = computed<UiLocaleOption[]>(() => {
    return locales.value.map((loc) => {
      const isStringLocale = typeof loc === 'string';
      const code = isStringLocale ? loc : loc.code;
      const match = catalogLocales.value.find((uiLocale) => uiLocale.code === code);
      if (match) {
        const normalizedDir = extractLocaleString(match, 'dir') === 'rtl' ? 'rtl' : 'ltr';
        return {
          code: match.code,
          name: extractLocaleString(match, 'name'),
          language: extractLocaleString(match, 'language'),
          dir: normalizedDir,
        } satisfies UiLocaleOption;
      }

      const fallbackName = isStringLocale ? loc : loc.name || code;
      const fallbackLanguage = !isStringLocale && 'language' in loc && loc.language ? loc.language : undefined;
      const dir = isStringLocale ? 'ltr' : loc.dir || 'ltr';
      return {
        code,
        name: fallbackName,
        language: fallbackLanguage,
        dir: dir === 'auto' ? 'ltr' : dir,
      } satisfies UiLocaleOption;
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
