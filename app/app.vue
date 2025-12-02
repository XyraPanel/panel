<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { storeToRefs } from 'pinia'
import { authClient } from '~/utils/auth-client'
import * as locales from '@nuxt/ui/locale'

await authClient.useSession(useFetch)

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)
const route = useRoute()

const { locale } = useI18n()

const currentLocale = computed(() => {
  const localeCode = locale.value as string
  return locales[localeCode as keyof typeof locales] || locales.en
})

const i18nHead = useLocaleHead({
  seo: true,
  lang: true,
  dir: true,
})

useHead(() => ({
  htmlAttrs: {
    lang: i18nHead.value.htmlAttrs?.lang || 'en',
    dir: (i18nHead.value.htmlAttrs?.dir || 'ltr') as 'ltr' | 'rtl' | 'auto',
  },
  link: [...(i18nHead.value.link || [])],
  meta: [...(i18nHead.value.meta || [])],
}))

const passwordCompromised = computed(() => {
  if (!isAuthenticated.value || !user.value) return false
  return Boolean((user.value as { passwordCompromised?: boolean }).passwordCompromised)
})

const { t } = useI18n()
const showPasswordWarning = ref(false)

watch([passwordCompromised, () => route.path], () => {
  if (!passwordCompromised.value) {
    showPasswordWarning.value = false
    return
  }
  showPasswordWarning.value = route.path !== '/account/security'
}, { immediate: true })
</script>

<template>
  <UApp :locale="currentLocale">
    <NuxtLoadingIndicator color="#16a34a" error-color="#ef4444" :height="3" />    
    <UModal
      v-model:open="showPasswordWarning"
      :dismissible="false"
      modal
      :title="t('account.security.password.passwordMarkedCompromised')"
      :close="false"
    >
      <template #body>
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-shield-alert" class="size-6 text-error shrink-0 mt-0.5" />
          <p class="text-sm text-foreground">
            {{ t('account.security.password.passwordPreviouslyCompromised') }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center justify-end w-full">
          <UButton
            color="error"
            :label="t('auth.forcePasswordChange')"
            to="/account/security"
            size="lg"
          />
        </div>
      </template>
    </UModal>
    
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
