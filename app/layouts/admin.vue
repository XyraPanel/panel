<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { SessionUser } from '#shared/types/auth'
import type { SecuritySettings, AdminNavItem } from '#shared/types/admin'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

const authStore = useAuthStore()

const ADMIN_NAV_ITEMS = computed<AdminNavItem[]>(() => [
  {
    id: 'admin-dashboard',
    label: t('admin.dashboard.title'),
    to: '/admin',
    order: 0,
  },
  {
    id: 'admin-users',
    label: t('admin.users.title'),
    to: '/admin/users',
    order: 10,
    permission: 'admin.users.read',
  },
  {
    id: 'admin-servers',
    label: t('admin.servers.title'),
    to: '/admin/servers',
    order: 20,
    permission: 'admin.servers.read',
  },
  {
    id: 'admin-api-keys',
    label: t('admin.apiKeys'),
    to: '/admin/api',
    order: 25,
    permission: 'admin.api.read',
  },
  {
    id: 'admin-nodes',
    label: t('admin.nodes.title'),
    to: '/admin/nodes',
    order: 30,
    permission: 'admin.nodes.read',
  },
  {
    id: 'admin-locations',
    label: t('admin.locations.title'),
    to: '/admin/locations',
    order: 40,
    permission: 'admin.locations.read',
  },
  {
    id: 'admin-service-packs',
    label: t('admin.navigation.servicePacks'),
    to: '/admin/nests',
    order: 50,
    permission: ['admin.nests.read', 'admin.eggs.read'],
  },
  {
    id: 'admin-mounts',
    label: t('admin.mounts.title'),
    to: '/admin/mounts',
    order: 60,
    permission: 'admin.mounts.read',
  },
  {
    id: 'admin-database-hosts',
    label: t('admin.databaseHosts.title'),
    to: '/admin/database-hosts',
    order: 70,
    permission: 'admin.database-hosts.read',
  },
  {
    id: 'admin-activity',
    label: t('admin.navigation.auditLog'),
    to: '/admin/activity',
    order: 80,
    permission: 'admin.activity.read',
  },
  {
    id: 'admin-schedules',
    label: t('admin.schedules.title'),
    to: '/admin/schedules',
    order: 85,
    permission: 'admin.schedules.read',
  },
  {
    id: 'admin-settings',
    label: t('admin.settings.title'),
    to: '/admin/settings',
    order: 90,
    permission: 'admin.settings.read',
  },
])

const CLIENT_NAV_ITEMS = computed(() => [
  {
    id: 'client-dashboard',
    label: t('dashboard.title'),
    to: '/',
    order: 0,
  },
  {
    id: 'client-servers',
    label: t('server.list.title'),
    to: '/server',
    order: 10,
  },
  {
    id: 'client-account-profile',
    label: t('account.profile.title'),
    to: '/account/profile',
    order: 20,
  },
  {
    id: 'client-account-security',
    label: t('account.security.title'),
    to: '/account/security',
    order: 25,
  },
  {
    id: 'client-account-api-keys',
    label: t('account.apiKeys.title'),
    to: '/account/api-keys',
    order: 30,
  },
  {
    id: 'client-account-ssh-keys',
    label: t('account.sshKeys.title'),
    to: '/account/ssh-keys',
    order: 35,
  },
  {
    id: 'client-account-sessions',
    label: t('account.sessions.title'),
    to: '/account/sessions',
    order: 40,
  },
  {
    id: 'client-account-activity',
    label: t('account.activity.title'),
    to: '/account/activity',
    order: 45,
  },
])

const route = useRoute()
const router = useRouter()
const {
  user: storeUser,
  permissions: userPermissions,
  isSuperUser: storeIsSuperUser,
  status: authStatus,
} = storeToRefs(authStore)

const createDefaultSecuritySettings = (): SecuritySettings => ({
  enforceTwoFactor: false,
  maintenanceMode: false,
  maintenanceMessage: '',
  announcementEnabled: false,
  announcementMessage: '',
})

const requestFetch = useRequestFetch() as (input: string, init?: Record<string, unknown>) => Promise<unknown>

async function fetchSecuritySettings(): Promise<SecuritySettings> {
  const result = await requestFetch('/api/admin/settings/security') as unknown
  return result as SecuritySettings
}

const { data: securitySettings } = await useAsyncData<SecuritySettings>(
  'admin-layout-security-settings',
  fetchSecuritySettings,
  {
    default: () => createDefaultSecuritySettings(),
  },
)

const sessionUser = computed<SessionUser | null>(() => storeUser.value ?? null)

const announcement = computed(() => (securitySettings.value?.announcementEnabled ? securitySettings.value?.announcementMessage?.trim() : ''))
const maintenanceMessage = computed(() => securitySettings.value?.maintenanceMessage?.trim() || t('layout.defaultMaintenanceMessage'))

const isMaintenanceGateActive = computed(() => {
  if (!securitySettings.value?.maintenanceMode) {
    return false
  }
  return !sessionUser.value || sessionUser.value.role !== 'admin'
})

const requiresTwoFactor = computed(() => Boolean(securitySettings.value?.enforceTwoFactor))
const hasTwoFactor = computed(() => Boolean(sessionUser.value && 'useTotp' in sessionUser.value && sessionUser.value.useTotp))
const showTwoFactorPrompt = computed(() => requiresTwoFactor.value && !hasTwoFactor.value)

const adminTitle = computed(() => {
  const title = route.meta.adminTitle
  if (typeof title === 'string' && title.length > 0) {
    const titleMap: Record<string, string> = {
      'Dashboard': t('admin.dashboard.title'),
      'Users': t('admin.users.title'),
      'Servers': t('admin.servers.title'),
      'Settings': t('admin.settings.title'),
      'Nodes': t('admin.nodes.title'),
      'Locations': t('admin.locations.title'),
      'Nests': t('admin.nests.title'),
      'Mounts': t('admin.mounts.title'),
      'Schedules': t('admin.schedules.title'),
      'API Keys': t('admin.apiKeys'),
      'Database Hosts': t('admin.databaseHosts.title'),
      'Activity': t('admin.activity.title'),
      'Audit log': t('admin.navigation.auditLog'),
      'Server details': t('admin.servers.title'),
      'Node details': t('admin.nodes.title'),
      'User profile': t('admin.users.title'),
    }
    return titleMap[title] || title
  }
  return t('admin.title')
})

const adminSubtitle = computed(() => {
  const subtitle = route.meta.adminSubtitle
  if (typeof subtitle === 'string' && subtitle.length > 0) {
    const subtitleMap: Record<string, string> = {
      'Infrastructure overview sourced from Wings metrics': t('admin.dashboard.subtitle'),
      'Audit panel accounts and Wings permissions': t('admin.users.subtitle'),
      'Configure panel settings and preferences': t('admin.settings.subtitle'),
      'Manage all servers in the panel.': t('admin.servers.description'),
      'Manage server nodes.': t('admin.nodes.description'),
      'Manage server locations.': t('admin.locations.description'),
      'Manage server nests and eggs.': t('admin.nests.description'),
      'Manage server mounts.': t('admin.mounts.description'),
      'Manage system schedules.': t('admin.schedules.description'),
      'Manage database hosts.': t('admin.databaseHosts.description'),
      'View system-wide activity logs.': t('admin.activity.description'),
      'Track panel-wide events mirrored from Wings': t('admin.activity.description'),
      'Review panel automation (Wings tasks & Nitro tasks)': t('admin.schedules.description'),
      'Manage existing keys or create new ones for API access.': t('account.apiKeys.description'),
      'Global view of panel servers synchronized with Wings': t('admin.servers.description'),
      'Manage Wings daemons and monitor node health': t('admin.nodes.description'),
      'Inspect Wings node metrics and allocations': t('admin.nodes.description'),
      'Manage server configuration and resources': t('admin.servers.description'),
      'Inspect panel access, owned servers, and activity': t('admin.users.subtitle'),
    }
    return subtitleMap[subtitle] || subtitle
  }
  return t('admin.navigation.infrastructureOverview')
})

const navItems = computed(() => {
  const canAccess = (permission?: string | string[]) => {
    if (!permission) {
      return true
    }

    const values = userPermissions.value

    if (Array.isArray(permission)) {
      return permission.some(value => values.includes(value))
    }

    return values.includes(permission)
  }

  return ADMIN_NAV_ITEMS.value
    .filter(item => storeIsSuperUser.value || canAccess(item.permission))
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY))
})

const navigateToSecuritySettings = () => {
  router.push('/account/security')
}

const handleSignOut = async () => {
  await authStore.logout()
  await router.push('/auth/login')
}

const { displayName, avatar } = storeToRefs(authStore)

const userLabel = computed(() => {
  if (!authStatus.value || authStatus.value !== 'authenticated' || !sessionUser.value) {
    return null
  }
  
  if (displayName.value && displayName.value.length > 0) {
    return displayName.value
  }
  
  if (sessionUser.value) {
    return sessionUser.value.username || sessionUser.value.email || sessionUser.value.name || null
  }
  
  return null
})

const userAvatar = computed(() => {
  if (!authStatus.value || authStatus.value !== 'authenticated' || !sessionUser.value) {
    return null
  }
  
  if (avatar.value) {
    return avatar.value
  }
  
  const name = sessionUser.value.username || sessionUser.value.email || sessionUser.value.name
  if (!name) {
    return null
  }
  
  return {
    alt: name,
    text: name.slice(0, 2).toUpperCase(),
  }
})

const accountMenuItems = computed(() => [
  [
    { label: t('account.profile.title'), to: '/account/profile' },
    { label: t('account.security.title'), to: '/account/security' },
    { label: t('account.apiKeys.title'), to: '/account/api-keys' },
    { label: t('account.sshKeys.title'), to: '/account/ssh-keys' },
    { label: t('account.sessions.title'), to: '/account/sessions' },
    { label: t('account.activity.title'), to: '/account/activity' },
  ],
  [
    { label: t('auth.signOut'), click: handleSignOut, color: 'error' },
  ],
])

const dashboardSearchOpen = ref(false)
const dashboardSearchTerm = ref('')
const dashboardSearchShortcut = 'meta_k'

const dashboardSearchGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const navigationItems: CommandPaletteItem[] = navItems.value.map(item => ({
    id: item.id,
    label: item.label,
    suffix: item.to,
    to: item.to,
    onSelect: (evt) => {
      evt?.preventDefault?.()
      if (item.to) {
        router.push(item.to)
      }
      dashboardSearchOpen.value = false
    },
  }))

  const clientItems: CommandPaletteItem[] = CLIENT_NAV_ITEMS.value
    .slice()
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY))
    .map(item => ({
      id: item.id,
      label: item.label,
      suffix: item.to,
      to: item.to,
      onSelect: (evt) => {
        evt?.preventDefault?.()
        if (item.to) {
          router.push(item.to)
        }
        dashboardSearchOpen.value = false
      },
    }))

  const accountItems: CommandPaletteItem[] = [
    {
      id: 'admin-account-security',
      label: t('account.security.title'),
      to: '/account/security',
      onSelect: (evt) => {
        evt?.preventDefault?.()
        navigateToSecuritySettings()
        dashboardSearchOpen.value = false
      },
    },
    {
      id: 'admin-sign-out',
      label: t('auth.signOut'),
      onSelect: async (evt) => {
        evt?.preventDefault?.()
        await handleSignOut()
        dashboardSearchOpen.value = false
      },
    },
  ]

  return [
    {
      id: 'navigation',
      label: t('common.navigation'),
      items: navigationItems,
    },
    {
      id: 'client',
      label: t('dashboard.title'),
      items: clientItems,
    },
    {
      id: 'account',
      label: t('dashboard.account'),
      items: accountItems,
    },
  ]
})
</script>

<template>
  <UDashboardGroup class="min-h-screen bg-muted/15" storage="local" storage-key="admin-dashboard">
    <UDashboardSidebar
      collapsible
      :toggle="{ icon: 'i-lucide-menu', label: t('common.navigation'), color: 'neutral', variant: 'ghost' }"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          to="/"
          class="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <UIcon name="i-lucide-arrow-left" class="size-3" />
          {{ t('layout.backToPanel') }}
        </NuxtLink>
        <UIcon v-else name="i-lucide-arrow-left" class="mx-auto size-4 text-muted-foreground" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          v-model:open="dashboardSearchOpen"
          class="mb-3 w-full"
          :block="collapsed"
          :shortcut="dashboardSearchShortcut"
          :label="t('common.search')"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="[navItems]"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-2">
          <ClientOnly>
            <template v-if="authStatus === 'authenticated' && sessionUser && userLabel">
              <UDropdownMenu :items="accountMenuItems">
                <UButton
                  color="neutral"
                  variant="ghost"
                  class="w-full"
                  :block="collapsed"
                >
                  <template #leading>
                    <UAvatar v-bind="userAvatar" size="sm" />
                  </template>
                  <span v-if="!collapsed">{{ userLabel }}</span>
                </UButton>
              </UDropdownMenu>
            </template>
            <template v-else>
              <UButton
                color="error"
                variant="ghost"
                class="w-full"
                :block="collapsed"
                to="/auth/login"
              >
                <template #leading>
                  <UIcon name="i-lucide-log-in" class="size-4" />
                </template>
                <span v-if="!collapsed">{{ t('auth.signIn') }}</span>
              </UButton>
            </template>
            <template #fallback>
              <UButton
                color="error"
                variant="ghost"
                class="w-full"
                :block="collapsed"
                to="/auth/login"
              >
                <template #leading>
                  <UIcon name="i-lucide-log-in" class="size-4" />
                </template>
                <span v-if="!collapsed">{{ t('auth.signIn') }}</span>
              </UButton>
            </template>
          </ClientOnly>

          <div v-if="!collapsed" class="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            <p>{{ t('layout.copyright', { year: new Date().getFullYear() }) }} <ULink href="https://xyrapanel.com" target="_blank">XyraPanel</ULink></p>
          </div>
          <UIcon v-else name="i-lucide-copyright" class="mx-auto size-3 text-muted-foreground/50" />
        </div>
      </template>
    </UDashboardSidebar>
    <UDashboardSearch
      v-model:open="dashboardSearchOpen"
      v-model:search-term="dashboardSearchTerm"
      :groups="dashboardSearchGroups"
      :shortcut="dashboardSearchShortcut"
      :placeholder="t('common.search')"
      :color-mode="false"
      :fuse="{
        fuseOptions: {
          threshold: 0.3,
          ignoreLocation: true,
          keys: ['label', 'suffix'],
        },
        resultLimit: 40,
      }"
    />
    <UDashboardPanel :ui="{ body: 'flex flex-1 flex-col p-0' }">
      <template #body>
        <header class="border-b border-default bg-background/70 backdrop-blur">
          <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <h1 class="text-xl font-semibold text-foreground">{{ adminTitle }}</h1>
              <p class="text-xs text-muted-foreground">{{ adminSubtitle }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <ClientOnly>
                <template v-if="authStatus === 'authenticated' && sessionUser && userLabel">
                  <div class="flex items-center gap-3 rounded-md border border-default bg-muted/30 px-3 py-2">
                    <div class="flex flex-col text-xs">
                      <span class="font-medium text-foreground">{{ userLabel }}</span>
                      <span v-if="sessionUser.email" class="text-muted-foreground">{{ sessionUser.email }}</span>
                    </div>
                    <UBadge v-if="sessionUser.role" size="xs" variant="subtle"
                      color="error" class="uppercase tracking-wide text-[10px]">
                      {{ sessionUser.role }}
                    </UBadge>
                    <UButton size="xs" variant="ghost" color="error"
                      icon="i-lucide-log-out" @click="handleSignOut" />
                  </div>
                </template>
                <template v-else>
                  <UButton size="xs" variant="ghost" color="error" to="/auth/login"
                    icon="i-lucide-log-in">
                    {{ t('auth.signIn') }}
                  </UButton>
                </template>
                <template #fallback>
                  <UButton size="xs" variant="ghost" color="error" to="/auth/login"
                    icon="i-lucide-log-in">
                    {{ t('auth.signIn') }}
                  </UButton>
                </template>
              </ClientOnly>
            </div>
          </div>
          <USeparator />
        </header>

        <div v-if="announcement" class="border-b border-primary/20 bg-primary/5">
          <div class="mx-auto flex w-full max-w-7xl items-center gap-3 px-6 py-3 text-sm text-primary">
            <UIcon name="i-lucide-info" class="size-4 shrink-0" />
            <span class="whitespace-pre-wrap">{{ announcement }}</span>
          </div>
        </div>

        <main class="flex-1 overflow-y-auto">
          <div v-if="isMaintenanceGateActive" class="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-6 py-16 text-center">
            <UIcon name="i-lucide-construction" class="size-10 text-warning" />
            <div class="space-y-2">
              <h2 class="text-xl font-semibold">{{ t('layout.weArePerformingMaintenance') }}</h2>
              <p class="text-sm text-muted-foreground">{{ maintenanceMessage }}</p>
            </div>
            <UButton variant="ghost" color="neutral" @click="handleSignOut">
              {{ t('auth.signOut') }}
            </UButton>
          </div>
          <div v-else class="mx-auto w-full max-w-7xl px-6 py-10 space-y-6">
            <UAlert v-if="showTwoFactorPrompt" color="warning" variant="soft" icon="i-lucide-shield-check">
              <template #title>{{ t('layout.enableTwoFactorAuthentication') }}</template>
              <template #description>
                {{ t('layout.strengthenAccountSecurity') }}
              </template>
              <template #actions>
                <UButton size="xs" color="warning" @click="navigateToSecuritySettings">
                  {{ t('layout.configure2FA') }}
                </UButton>
              </template>
            </UAlert>

            <slot />
          </div>
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
