<script setup lang="ts">
import { computed } from 'vue'
import type { SessionUser } from '#shared/types/auth'
import type { SecuritySettings } from '#shared/types/admin-settings'

const route = useRoute()
const router = useRouter()
const { data: sessionData, status, getSession, signOut } = useAuth()
const { data: securitySettings } = await useFetch<SecuritySettings>('/api/admin/settings/security', {
  key: 'admin-layout-security-settings',
  default: (): SecuritySettings => ({
    enforceTwoFactor: false,
    maintenanceMode: false,
    maintenanceMessage: '',
    announcementEnabled: false,
    announcementMessage: '',
  }),
})

const announcement = computed(() => securitySettings.value?.announcementEnabled ? securitySettings.value?.announcementMessage?.trim() : '')
const maintenanceMessage = computed(() => securitySettings.value?.maintenanceMessage?.trim() || 'The panel is currently undergoing maintenance. Please check back soon.')

const isMaintenanceGateActive = computed(() => {
  if (!securitySettings.value?.maintenanceMode)
    return false

  const user = sessionData.value?.user as SessionUser | undefined
  return !user || user.role !== 'admin'
})

const requiresTwoFactor = computed(() => Boolean(securitySettings.value?.enforceTwoFactor))
const hasTwoFactor = computed(() => {
  const user = sessionData.value?.user
  return Boolean(user && typeof user === 'object' && 'useTotp' in user && (user as { useTotp?: boolean }).useTotp)
})
const showTwoFactorPrompt = computed(() => requiresTwoFactor.value && !hasTwoFactor.value)

function navigateToSecuritySettings() {
  router.push('/account/security')
}

const sessionUser = computed<SessionUser | null>(() => {
  const candidate = sessionData.value?.user as SessionUser | undefined
  if (!candidate) {
    return null
  }

  return {
    id: candidate.id ?? null,
    name: candidate.name ?? null,
    email: candidate.email ?? null,
    username: candidate.username ?? candidate.email ?? null,
    role: candidate.role ?? null,
    image: candidate.image ?? null,
    permissions: candidate.permissions ?? [],
  }
})
const isAuthenticating = computed(() => status.value === 'loading')

watch(status, async (value) => {
  if (value === 'authenticated') {
    await getSession()
    return
  }

  if (value === 'unauthenticated') {
    router.replace({ path: '/auth/login', query: { redirect: route.fullPath } })
  }
}, { immediate: true })

async function handleSignOut() {
  await signOut({ callbackUrl: '/auth/login' })
}

const adminTitle = computed(() => {
  const title = route.meta.adminTitle
  if (typeof title === 'string' && title.length > 0)
    return title
  return 'Admin'
})

const adminSubtitle = computed(() => {
  const subtitle = route.meta.adminSubtitle
  if (typeof subtitle === 'string' && subtitle.length > 0)
    return subtitle
  return 'Infrastructure overview and controls'
})

const navItems = computed(() => {
  const user = sessionUser.value
  const permissions = user?.permissions ?? []
  const isAdmin = user?.role === 'admin'
  const isSuperUser = isAdmin || Boolean((sessionData.value?.user as SessionUser | undefined)?.remember)
  const hasPermission = (permission?: string | string[]) => {
    if (!permission) {
      return true
    }

    if (Array.isArray(permission)) {
      return permission.some(entry => permissions.includes(entry))
    }

    return permissions.includes(permission)
  }
  const items = [
    {
      id: 'admin-dashboard',
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/admin',
      order: 0,
      permission: undefined,
    },
    {
      id: 'admin-users',
      label: 'Users',
      icon: 'i-lucide-users',
      to: '/admin/users',
      order: 10,
      permission: 'admin.users.read',
    },
    {
      id: 'admin-servers',
      label: 'Servers',
      icon: 'i-lucide-server',
      to: '/admin/servers',
      order: 20,
      permission: 'admin.servers.read',
    },
    {
      id: 'admin-api-keys',
      label: 'API Keys',
      icon: 'i-lucide-key-round',
      to: '/admin/api',
      order: 25,
      permission: 'admin.api.read',
    },
    {
      id: 'admin-nodes',
      label: 'Nodes',
      icon: 'i-lucide-cpu',
      to: '/admin/nodes',
      order: 30,
      permission: 'admin.nodes.read',
    },
    {
      id: 'admin-locations',
      label: 'Locations',
      icon: 'i-lucide-map-pin',
      to: '/admin/locations',
      order: 40,
      permission: 'admin.locations.read',
    },
    {
      id: 'admin-service-packs',
      label: 'Service Packs',
      icon: 'i-lucide-layers',
      to: '/admin/nests',
      order: 50,
      permission: ['admin.nests.read', 'admin.eggs.read'],
    },
    {
      id: 'admin-mounts',
      label: 'Mounts',
      icon: 'i-lucide-folder-tree',
      to: '/admin/mounts',
      order: 60,
      permission: 'admin.mounts.read',
    },
    {
      id: 'admin-database-hosts',
      label: 'Database Hosts',
      icon: 'i-lucide-database',
      to: '/admin/database-hosts',
      order: 70,
      permission: 'admin.database-hosts.read',
    },
    {
      id: 'admin-activity',
      label: 'Audit Log',
      icon: 'i-lucide-activity',
      to: '/admin/activity',
      order: 80,
      permission: 'admin.activity.read',
    },
    {
      id: 'admin-schedules',
      label: 'Schedules',
      icon: 'i-lucide-calendar-clock',
      to: '/admin/schedules',
      order: 85,
      permission: 'admin.schedules.read',
    },
    {
      id: 'admin-settings',
      label: 'Settings',
      icon: 'i-lucide-settings',
      to: '/admin/settings',
      order: 90,
      permission: 'admin.settings.read',
    },
  ]

  return items
    .filter(item => isSuperUser || hasPermission(item.permission))
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY))
})
</script>

<template>
  <UDashboardGroup class="min-h-screen bg-muted/15">
    <UDashboardSidebar collapsible resizable :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink v-if="!collapsed" to="/" class="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
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
        <div v-if="!collapsed" class="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          <p>© {{ new Date().getFullYear() }} <ULink href="https://xyrapanel.com" target="_blank">XyraPanel</ULink></p>
        </div>
        <UIcon v-else name="i-lucide-copyright" class="mx-auto size-3 text-muted-foreground/50" />
      </template>
    </UDashboardSidebar>

    <div class="flex flex-1 flex-col">
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
              <UBadge v-if="sessionUser?.role" size="xs" variant="soft"
                color="error" class="uppercase tracking-wide text-[10px]">
                {{ sessionUser.role }}
              </UBadge>
              <UButton v-if="status === 'authenticated'" size="xs" variant="ghost" color="error"
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
    </div>
  </UDashboardGroup>
</template>
