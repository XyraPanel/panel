<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { NavigationMenuItem } from '@nuxt/ui'
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const appName = computed(() => runtimeConfig.public.appName || 'XyraPanel')

const authStore = useAuthStore()
const { user, isAdmin: isAdminRef, status: authStatus } = storeToRefs(authStore)
const signOutLoading = ref(false)

const { data: securitySettings } = await useFetch('/api/admin/settings/security', {
  key: 'default-layout-security-settings',
  default: () => ({
    maintenanceMode: false,
    maintenanceMessage: '',
  } as { maintenanceMode: boolean; maintenanceMessage: string }),
})

const isMaintenanceMode = computed(() => {
  if (!securitySettings.value?.maintenanceMode) return false
  if (authStatus.value === 'loading' || authStatus.value === 'unauthenticated') return false
  const isAdmin = isAdminRef.value || user.value?.role === 'admin'
  return !isAdmin
})
const maintenanceMessage = computed(() => securitySettings.value?.maintenanceMessage?.trim() || t('layout.defaultMaintenanceMessage'))

const userLabel = computed(() => {
  if (!user.value) return t('common.user')
  return user.value.username || user.value.email || user.value.name || t('common.user')
})

const userAvatar = computed(() => {
  const label = userLabel.value
  return {
    alt: label,
    text: label === t('common.user') ? 'U' : label.slice(0, 2).toUpperCase(),
  }
})

async function handleSignOut() {
  if (signOutLoading.value) {
    return
  }

  signOutLoading.value = true
  try {
    await authStore.logout()
    await navigateTo(localePath('/auth/login'))
  }
  catch (error) {
    console.error('Failed to sign out', error)
    signOutLoading.value = false
  }
}

const navigationItems = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    {
      label: t('dashboard.title'),
      to: localePath('index'),
    },
    {
      label: t('server.list.title'),
      to: localePath('/server'),
    },
    {
      label: t('dashboard.account'),
      children: [
        { label: t('account.profile.title'), to: localePath('/account/profile') },
        { label: t('account.security.title'), to: localePath('/account/security') },
        { label: t('account.apiKeys.title'), to: localePath('/account/api-keys') },
        { label: t('account.sshKeys.title'), to: localePath('/account/ssh-keys') },
        { label: t('account.sessions.title'), to: localePath('/account/sessions') },
        { label: t('account.activity.title'), to: localePath('/account/activity') },
      ],
    },
  ]

  return items
})

const isAdminUser = computed(() => {
  if (isAdminRef.value) return true
  if (user.value?.role === 'admin') return true
  return false
})

const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const uiLocales = computed(() => {
  return locales.value.map(loc => {
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
  if (!newLocale || newLocale === locale.value) return
  
  const validLocale = locales.value.find(l => {
    const code = typeof l === 'string' ? l : l.code
    return code === newLocale
  })
  
  if (validLocale) {
    const code = typeof validLocale === 'string' ? validLocale : validLocale.code
    const path = switchLocalePath(code)
    if (path) {
      // Normalize path - ensure trailing slash for root locale paths
      // switchLocalePath returns '/es' for root route, but we need '/es/'
      const normalizedPath = (path === '/es' && route.path === '/') ? '/es/' : path
      await navigateTo(normalizedPath)
    }
  }
}
</script>

<template>
  <UDashboardGroup class="min-h-screen bg-muted/30" storage="local" storage-key="client-dashboard">
    <UDashboardSidebar
      collapsible
      :toggle="{ icon: 'i-lucide-menu', label: t('common.navigation'), color: 'neutral', variant: 'ghost' }"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink v-if="!collapsed" :to="localePath('index')" class="group inline-flex items-center gap-2">
          <h1 class="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition">
            {{ appName }}
          </h1>
        </NuxtLink>
        <UIcon v-else name="i-simple-icons-nuxtdotjs" class="mx-auto size-5 text-primary" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="navigationItems" orientation="vertical" />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="[[
            { label: t('account.profile.title'), to: localePath('/account/profile') },
            { label: t('account.security.title'), to: localePath('/account/security') },
            { label: t('account.apiKeys.title'), to: localePath('/account/api-keys') },
            { label: t('account.sshKeys.title'), to: localePath('/account/ssh-keys') },
            { label: t('account.sessions.title'), to: localePath('/account/sessions') },
            { label: t('account.activity.title'), to: localePath('/account/activity') }
          ], [
            { label: t('auth.signOut'), click: handleSignOut, color: 'error' }
          ]]"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full"
            :block="collapsed"
            type="button"
            @click.prevent
          >
            <template #leading>
              <UAvatar v-bind="userAvatar" size="sm" />
            </template>
            <span v-if="!collapsed">{{ userLabel }}</span>
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel :key="'dashboard-panel'" :ui="{ body: 'flex flex-1 flex-col p-0' }">
      <template #body>
        <UDashboardNavbar>
          <template #right>
            <div class="flex items-center gap-2">
              <ULocaleSelect
                :model-value="locale"
                :locales="uiLocales"
                size="sm"
                variant="ghost"
                class="w-32"
                @update:model-value="handleLocaleChange($event)"
              />
              <UButton v-if="isAdminUser" icon="i-lucide-shield" variant="ghost" color="error" to="/admin">
                {{ t('admin.title') }}
              </UButton>
              <UButton icon="i-lucide-log-out" color="primary" variant="subtle" :loading="signOutLoading"
                @click="handleSignOut">
                {{ t('auth.signOut') }}
              </UButton>
            </div>
          </template>
        </UDashboardNavbar>

        <main class="flex-1 overflow-y-auto">
          <div v-if="isMaintenanceMode" class="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-6 py-16 text-center">
            <UIcon name="i-lucide-construction" class="size-16 text-warning" />
            <div class="space-y-2">
              <h2 class="text-xl font-semibold">{{ t('layout.weArePerformingMaintenance') }}</h2>
              <p class="text-sm text-muted-foreground whitespace-pre-wrap">{{ maintenanceMessage }}</p>
            </div>
            <UButton variant="ghost" color="neutral" @click="handleSignOut">
              {{ t('auth.signOut') }}
            </UButton>
          </div>
          <div v-else class="px-6 py-8">
            <slot />
          </div>
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
