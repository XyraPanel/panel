<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { SessionUser } from '#shared/types/auth'
import type { SecuritySettings } from '#shared/types/admin-settings'
import type { AdminNavItem } from '#shared/types/admin-navigation'

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: 'admin-dashboard',
    label: 'Dashboard',
    to: '/admin',
    order: 0,
  },
  {
    id: 'admin-users',
    label: 'Users',
    to: '/admin/users',
    order: 10,
    permission: 'admin.users.read',
  },
  {
    id: 'admin-servers',
    label: 'Servers',
    to: '/admin/servers',
    order: 20,
    permission: 'admin.servers.read',
  },
  {
    id: 'admin-api-keys',
    label: 'API Keys',
    to: '/admin/api',
    order: 25,
    permission: 'admin.api.read',
  },
  {
    id: 'admin-nodes',
    label: 'Nodes',
    to: '/admin/nodes',
    order: 30,
    permission: 'admin.nodes.read',
  },
  {
    id: 'admin-locations',
    label: 'Locations',
    to: '/admin/locations',
    order: 40,
    permission: 'admin.locations.read',
  },
  {
    id: 'admin-service-packs',
    label: 'Service Packs',
    to: '/admin/nests',
    order: 50,
    permission: ['admin.nests.read', 'admin.eggs.read'],
  },
  {
    id: 'admin-mounts',
    label: 'Mounts',
    to: '/admin/mounts',
    order: 60,
    permission: 'admin.mounts.read',
  },
  {
    id: 'admin-database-hosts',
    label: 'Database Hosts',
    to: '/admin/database-hosts',
    order: 70,
    permission: 'admin.database-hosts.read',
  },
  {
    id: 'admin-activity',
    label: 'Audit Log',
    to: '/admin/activity',
    order: 80,
    permission: 'admin.activity.read',
  },
  {
    id: 'admin-schedules',
    label: 'Schedules',
    to: '/admin/schedules',
    order: 85,
    permission: 'admin.schedules.read',
  },
  {
    id: 'admin-settings',
    label: 'Settings',
    to: '/admin/settings',
    order: 90,
    permission: 'admin.settings.read',
  },
]

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const {
  user: storeUser,
  permissions: userPermissions,
  isSuperUser: storeIsSuperUser,
  isAuthenticating,
  status: authStatus,
} = storeToRefs(authStore)

const createDefaultSecuritySettings = (): SecuritySettings => ({
  enforceTwoFactor: false,
  maintenanceMode: false,
  maintenanceMessage: '',
  announcementEnabled: false,
  announcementMessage: '',
})

const { data: securitySettings } = await useFetch<SecuritySettings>('/api/admin/settings/security', {
  key: 'admin-layout-security-settings',
  default: () => createDefaultSecuritySettings(),
})

const rawSessionUser = computed<SessionUser | null>(() => storeUser.value ?? null)

const sessionUser = computed<SessionUser | null>(() => {
  const user = rawSessionUser.value
  if (!user) {
    return null
  }

  return {
    id: user.id ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    username: user.username ?? user.email ?? null,
    role: user.role ?? null,
    image: user.image ?? null,
    permissions: user.permissions ?? [],
  }
})

const announcement = computed(() => (securitySettings.value?.announcementEnabled ? securitySettings.value?.announcementMessage?.trim() : ''))
const maintenanceMessage = computed(() => securitySettings.value?.maintenanceMessage?.trim() || 'The panel is currently undergoing maintenance. Please check back soon.')

const isMaintenanceGateActive = computed(() => {
  if (!securitySettings.value?.maintenanceMode) {
    return false
  }

  return !rawSessionUser.value || rawSessionUser.value.role !== 'admin'
})

const requiresTwoFactor = computed(() => Boolean(securitySettings.value?.enforceTwoFactor))
const hasTwoFactor = computed(() => Boolean(rawSessionUser.value && 'useTotp' in rawSessionUser.value && rawSessionUser.value.useTotp))
const showTwoFactorPrompt = computed(() => requiresTwoFactor.value && !hasTwoFactor.value)

watch(authStatus, async (value) => {
  if (value === 'authenticated') {
    await authStore.syncSession()
  }
  else if (value === 'unauthenticated') {
    await router.replace({ path: '/auth/login', query: { redirect: route.fullPath } })
  }
}, { immediate: true })

const adminTitle = computed(() => {
  const title = route.meta.adminTitle
  return typeof title === 'string' && title.length > 0 ? title : 'Admin'
})

const adminSubtitle = computed(() => {
  const subtitle = route.meta.adminSubtitle
  return typeof subtitle === 'string' && subtitle.length > 0 ? subtitle : 'Infrastructure overview and controls'
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

  return ADMIN_NAV_ITEMS
    .filter(item => storeIsSuperUser.value || canAccess(item.permission))
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY))
})

const navigateToSecuritySettings = () => {
  router.push('/account/security')
}

const handleSignOut = async () => {
  await authStore.logout({ callbackUrl: '/auth/login' })
}

const userLabel = computed(() => sessionUser.value?.username || sessionUser.value?.email || 'Administrator')
const userAvatar = computed(() => {
  const fallback = sessionUser.value?.username || sessionUser.value?.email || 'Administrator'
  return {
    alt: fallback,
    text: fallback.slice(0, 2).toUpperCase(),
  }
})

const accountMenuItems = computed(() => [
  [
    { label: 'Profile', to: '/account/profile' },
    { label: 'Security', to: '/account/security' },
    { label: 'API Keys', to: '/account/api-keys' },
    { label: 'SSH Keys', to: '/account/ssh-keys' },
    { label: 'Sessions', to: '/account/sessions' },
    { label: 'Activity', to: '/account/activity' },
  ],
  [
    { label: 'Sign out', click: handleSignOut, color: 'error' },
  ],
])
</script>

<template>
  <UDashboardGroup class="min-h-screen bg-muted/15" storage="local" storage-key="admin-dashboard">
    <UDashboardSidebar
      collapsible
      :toggle="{ icon: 'i-lucide-menu', label: 'Navigation', color: 'neutral', variant: 'ghost' }"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          to="/"
          class="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <UIcon name="i-lucide-arrow-left" class="size-3" />
          Back to panel
        </NuxtLink>
        <UIcon v-else name="i-lucide-arrow-left" class="mx-auto size-4 text-muted-foreground" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="[navItems]"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-2">
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

          <div v-if="!collapsed" class="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            <p>© {{ new Date().getFullYear() }} <ULink href="https://xyrapanel.com" target="_blank">XyraPanel</ULink></p>
          </div>
          <UIcon v-else name="i-lucide-copyright" class="mx-auto size-3 text-muted-foreground/50" />
        </div>
      </template>
    </UDashboardSidebar>
    <UDashboardPanel :ui="{ body: 'flex flex-1 flex-col p-0' }">
      <template #body>
        <header class="border-b border-default bg-background/70 backdrop-blur">
          <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <h1 class="text-xl font-semibold text-foreground">{{ adminTitle }}</h1>
              <p class="text-xs text-muted-foreground">{{ adminSubtitle }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-3 rounded-md border border-default bg-muted/30 px-3 py-2">
                <div class="flex flex-col text-xs">
                  <span class="font-medium text-foreground">
                    <template v-if="sessionUser">{{ sessionUser.name || sessionUser.username || 'Administrator'
                      }}</template>
                    <span v-else>Signing in…</span>
                  </span>
                  <span v-if="sessionUser?.email" class="text-muted-foreground">{{ sessionUser.email }}</span>
                </div>
                <UBadge v-if="sessionUser?.role" size="xs" variant="subtle"
                  color="error" class="uppercase tracking-wide text-[10px]">
                  {{ sessionUser.role }}
                </UBadge>
                <UButton v-if="authStatus === 'authenticated'" size="xs" variant="ghost" color="error"
                  icon="i-lucide-log-out" @click="handleSignOut" />
              </div>
            </div>
          </div>
          <USeparator />
          <div v-if="isAuthenticating" class="bg-warning/10 px-6 py-2 text-xs text-warning">
            Authenticating session…
          </div>
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
              <h2 class="text-xl font-semibold">We&rsquo;re performing maintenance</h2>
              <p class="text-sm text-muted-foreground">{{ maintenanceMessage }}</p>
            </div>
            <UButton variant="ghost" color="neutral" @click="handleSignOut">
              Sign out
            </UButton>
          </div>
          <div v-else class="mx-auto w-full max-w-7xl px-6 py-10 space-y-6">
            <UAlert v-if="showTwoFactorPrompt" color="warning" variant="soft" icon="i-lucide-shield-check">
              <template #title>Enable two-factor authentication</template>
              <template #description>
                Strengthen account security by enabling TOTP. You&rsquo;ll be redirected to the security page to finish setup.
              </template>
              <template #actions>
                <UButton size="xs" color="warning" @click="navigateToSecuritySettings">
                  Configure 2FA
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
