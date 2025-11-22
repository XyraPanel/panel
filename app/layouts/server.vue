<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const serverId = computed(() => route.params.id as string)

const serverTitle = computed(() => {
  const title = route.meta.serverTitle
  return typeof title === 'string' && title.length > 0 ? title : `Server ${serverId.value}`
})

const navItems = computed(() => {
  const basePath = `/server/${serverId.value}`
  const currentPath = route.path

  return [
    {
      label: 'Console',
      icon: 'i-lucide-terminal',
      to: `${basePath}/console`,
      active: currentPath === `${basePath}/console`,
    },
    {
      label: 'Activity',
      icon: 'i-lucide-activity',
      to: `${basePath}/activity`,
      active: currentPath === `${basePath}/activity`,
    },
    {
      label: 'Files',
      icon: 'i-lucide-folder-open',
      to: `${basePath}/files`,
      active: currentPath.startsWith(`${basePath}/files`),
    },
    {
      label: 'Backups',
      icon: 'i-lucide-database-backup',
      to: `${basePath}/backups`,
      active: currentPath.startsWith(`${basePath}/backups`),
    },
    {
      label: 'Schedules',
      icon: 'i-lucide-calendar-clock',
      to: `${basePath}/schedules`,
      active: currentPath.startsWith(`${basePath}/schedules`),
    },
    {
      label: 'Users',
      icon: 'i-lucide-users',
      to: `${basePath}/users`,
      active: currentPath.startsWith(`${basePath}/users`),
    },
    {
      label: 'Databases',
      icon: 'i-lucide-database',
      to: `${basePath}/databases`,
      active: currentPath.startsWith(`${basePath}/databases`),
    },
    {
      label: 'Network',
      icon: 'i-lucide-network',
      to: `${basePath}/network`,
      active: currentPath.startsWith(`${basePath}/network`),
    },
    {
      label: 'Settings',
      icon: 'i-lucide-cog',
      to: `${basePath}/settings`,
      active: currentPath.startsWith(`${basePath}/settings`),
    },
  ]
})
</script>

<template>
  <UDashboardGroup class="min-h-screen bg-muted/20" storage="local" storage-key="server-dashboard">
    <UDashboardSidebar
      collapsible
      :toggle="{ icon: 'i-lucide-menu', label: 'Server navigation', color: 'neutral', variant: 'ghost' }"
      :ui="{ body: 'flex flex-col gap-1 px-2 pb-4', header: 'px-4 py-4', footer: 'border-t border-default px-4 py-3' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/server" class="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
          <UIcon v-if="collapsed" name="i-lucide-arrow-left" class="mx-auto size-4" />
          <template v-else>
            <UIcon name="i-lucide-arrow-left" class="size-3" />
            Back to servers
          </template>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="[navItems]"
          orientation="vertical"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel :ui="{ body: 'flex flex-1 flex-col p-0' }">
      <template #body>
        <header class="border-b border-default bg-background/70 backdrop-blur">
          <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <h1 class="text-xl font-semibold text-foreground">{{ serverTitle }}</h1>
              <p class="text-xs text-muted-foreground">Manage this instance via the tabs below.</p>
            </div>
            <div class="flex items-center gap-2">
              <UButton icon="i-lucide-cog" variant="ghost" color="neutral" :to="`/server/${serverId}/settings`">Settings
              </UButton>
            </div>
          </div>
        </header>

        <main class="flex-1 overflow-y-auto">
          <div class="mx-auto w-full max-w-7xl px-6 py-10">
            <slot />
          </div>
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
