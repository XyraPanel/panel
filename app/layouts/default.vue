<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { NavigationMenuItem } from '@nuxt/ui'

const authStore = useAuthStore()
const { user, displayName, avatar, isAdmin: isAdminRef } = storeToRefs(authStore)
const signOutLoading = ref(false)

async function handleSignOut() {
  if (signOutLoading.value) {
    return
  }

  signOutLoading.value = true
  try {
    await authStore.logout({ redirect: false })
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
      to: '/',
    },
    {
      label: 'Servers',
      to: '/server',
    },
    {
      label: 'Account',
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

const userLabel = computed(() => displayName.value || user.value?.email || 'Account')
const userAvatar = computed(() => avatar.value)
const isAdminUser = computed(() => isAdminRef.value)
</script>

<template>
  <div class="flex min-h-screen bg-muted/30">
    <UDashboardSidebar collapsible resizable :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink v-if="!collapsed" to="/" class="group inline-flex items-center gap-2">
          <h1 class="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition">
            XyraPanel
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
            { label: 'Profile', to: '/account/profile' },
            { label: 'Security', to: '/account/security' },
            { label: 'API Keys', to: '/account/api-keys' },
            { label: 'SSH Keys', to: '/account/ssh-keys' },
            { label: 'Sessions', to: '/account/sessions' },
            { label: 'Activity', to: '/account/activity' }
          ], [
            { label: 'Sign out', click: handleSignOut, color: 'error' }
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

    <div class="flex flex-1 flex-col">
      <header class="border-b border-default bg-background/80 backdrop-blur">
        <div class="mx-auto flex w-full max-w-6xl items-center justify-end gap-4 px-6 py-4">
          <div class="flex items-center gap-2">
            <UButton v-if="isAdminUser" icon="i-lucide-shield" variant="ghost" color="error" to="/admin">
              Admin
            </UButton>
            <UButton icon="i-lucide-log-out" color="primary" variant="subtle" :loading="signOutLoading"
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
