<script setup lang="ts">
import { computed } from 'vue'

const { t, locale, locales } = useI18n()
const route = useRoute()
const switchLocalePath = useSwitchLocalePath()

const uiLocales = computed(() => {
  return locales.value.map((loc) => {
    const dir = typeof loc === 'string' ? 'ltr' : (loc.dir || 'ltr')
    return {
      code: typeof loc === 'string' ? loc : loc.code,
      name: typeof loc === 'string' ? loc : (loc.name || loc.code),
      language: typeof loc === 'string' ? loc : (loc.language || loc.code),
      dir: (dir === 'auto' ? 'ltr' : dir) as 'ltr' | 'rtl',
      messages: {},
    }
  })
})

async function handleLocaleChange(newLocale: string | undefined) {
  if (!newLocale || newLocale === locale.value)
    return

  const validLocale = locales.value.find((l) => {
    const code = typeof l === 'string' ? l : l.code
    return code === newLocale
  })

  if (!validLocale)
    return

  const code = typeof validLocale === 'string' ? validLocale : validLocale.code
  const path = switchLocalePath(code)
  if (!path)
    return

  const normalizedPath = (path === '/es' && route.path === '/') ? '/es/' : path
  await navigateTo(normalizedPath)
}
</script>

<template>
  <div class="relative min-h-screen">
    <UContainer class="min-h-screen flex items-center justify-center py-12">
      <div class="w-full max-w-md space-y-4">
        <UCard :ui="{
          body: 'space-y-6',
          header: 'text-center space-y-2',
        }">
          <slot />
          <p class="text-center text-xs text-muted-foreground">
            {{ t('layout.copyright', { year: new Date().getFullYear() }) }} <ULink to="https://xyrapanel.com/" target="_blank">XyraPanel</ULink>
          </p>
        </UCard>
      </div>
    </UContainer>

    <div class="fixed bottom-6 right-6 z-30">
      <ULocaleSelect
        :model-value="locale"
        :locales="uiLocales"
        size="sm"
        variant="soft"
        class="w-40 shadow-lg"
        @update:model-value="handleLocaleChange($event)"
      />
    </div>
  </div>
</template>