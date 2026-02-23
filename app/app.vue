<script setup lang="ts">
import { authClient } from '~/utils/auth-client';
import * as locales from '@nuxt/ui/locale';

await authClient.useSession(useFetch);

const { locale } = useI18n();

const currentLocale = computed(() => {
  const localeCode = locale.value as string;
  return locales[localeCode as keyof typeof locales] || locales.en;
});

const i18nHead = useLocaleHead({
  seo: true,
  lang: true,
  dir: true,
});

useHead(() => ({
  htmlAttrs: {
    lang: i18nHead.value.htmlAttrs?.lang || 'en',
    dir: (i18nHead.value.htmlAttrs?.dir || 'ltr') as 'ltr' | 'rtl' | 'auto',
  },
  link: [...(i18nHead.value.link || [])],
  meta: [...(i18nHead.value.meta || [])],
}));
</script>

<template>
  <UApp :locale="currentLocale">
    <NuxtPwaAssets />
    <NuxtLoadingIndicator color="#16a34a" error-color="#ef4444" :height="3" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
