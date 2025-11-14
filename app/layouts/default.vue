<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { SanitizedUser } from '#shared/types/auth'

const { signOut, data: session } = useAuth()
const signOutLoading = ref(false)

async function handleSignOut() {
  if (signOutLoading.value) {
    return
  }

  signOutLoading.value = true
  try {
    await signOut({ redirect: false })
    await navigateTo('/auth/login')
  }
  catch (error) {
    console.error('Failed to sign out', error)
    signOutLoading.value = false
  }
}

const navigationItems = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    {
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/',
    },
    {
      label: 'Servers',
      icon: 'i-lucide-server',
      to: '/server',
    },
    {
      label: 'Activity',
      icon: 'i-lucide-activity',
      to: '/activity',
    },
    {
      label: 'Account',
      icon: 'i-lucide-user-cog',
      to: '/account',
      children: [
        { label: 'Profile', to: '/account/profile' },
        { label: 'Security', to: '/account/security' },
        { label: 'API Keys', to: '/account/api-keys' },
        { label: 'SSH Keys', to: '/account/ssh-keys' },
        { label: 'Sessions', to: '/account/sessions' },
        { label: 'Activity', to: '/account/activity' },
      ],
    },
  ]

  return items
})

const authUser = computed<Partial<SanitizedUser> | null>(() => {
  const data = session.value as unknown
  if (data && typeof data === 'object' && 'user' in (data as Record<string, unknown>)) {
    const { user } = data as { user?: Partial<SanitizedUser> }
    return user ?? null
  }
  return null
})

const userLabel = computed(() => authUser.value?.username || authUser.value?.email || 'Account')
const userAvatar = computed(() => {
  const candidate = (authUser.value as { image?: string } | null)?.image
  return candidate ? { src: candidate } : undefined
})

const isAdminUser = computed(() => authUser.value?.role === 'admin')
</script>

<template>
  <div class="flex min-h-screen bg-muted/30">
    <UDashboardSidebar collapsible resizable :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink v-if="!collapsed" to="/" class="group inline-flex items-center gap-2">
          <span class="rounded bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Xyra
          </span>
          <span class="text-xs font-medium text-muted-foreground group-hover:text-foreground transition">
            Panel
          </span>
        </NuxtLink>
        <UIcon v-else name="i-simple-icons-nuxtdotjs" class="mx-auto size-5 text-primary" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="navigationItems" orientation="vertical" />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="[[
            { label: 'Profile', icon: 'i-lucide-user', to: '/account/profile' },
            { label: 'Security', icon: 'i-lucide-shield', to: '/account/security' },
            { label: 'API Keys', icon: 'i-lucide-key', to: '/account/api-keys' },
            { label: 'SSH Keys', icon: 'i-lucide-terminal', to: '/account/ssh-keys' },
            { label: 'Sessions', icon: 'i-lucide-monitor', to: '/account/sessions' },
            { label: 'Activity', icon: 'i-lucide-activity', to: '/account/activity' }
          ], [
            { label: 'Sign out', icon: 'i-lucide-log-out', click: handleSignOut }
          ]]"
        >
          <UButton :avatar="userAvatar" :label="collapsed ? undefined : userLabel" color="neutral" variant="ghost"
            class="w-full" :block="collapsed" />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <div class="flex flex-1 flex-col">
      <header class="border-b border-default bg-background/80 backdrop-blur">
        <div class="mx-auto flex w-full max-w-6xl items-center justify-end gap-4 px-6 py-4">
          <div class="flex items-center gap-2">
            <UButton v-if="isAdminUser" icon="i-lucide-shield" variant="ghost" color="neutral" to="/admin">
              Admin
            </UButton>
            <UButton icon="i-lucide-cog" variant="ghost" color="neutral" to="/account">Account</UButton>
            <UButton icon="i-lucide-log-out" color="primary" variant="soft" :loading="signOutLoading"
              @click="handleSignOut">
              Sign out
            </UButton>
          </div>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-6xl px-6 py-8">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
