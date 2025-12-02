<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const route = useRoute()
const serverId = computed(() => route.params.id as string)

const { data: serverResponse } = await useFetch(
  `/api/servers/${serverId.value}`,
  {
    watch: [serverId],
    key: `server-${serverId.value}`,
    immediate: true,
  },
)

const server = computed(() => {
  const response = serverResponse.value as { data: { name: string; identifier: string } } | null
  if (import.meta.dev) {
    console.log('[Server Layout] serverResponse.value:', serverResponse.value)
    console.log('[Server Layout] server data:', response?.data)
  }
  return response?.data ?? null
})

const serverName = computed(() => {
  const name = server.value?.name
  if (import.meta.dev) {
    console.log('[Server Layout] serverName computed:', name)
  }
  return name && name.trim() ? name : t('common.server')
})

const serverIdentifier = computed(() => {
  const identifier = server.value?.identifier
  return identifier || serverId.value
})

const navItems = computed(() => {
  const basePath = `/server/${serverId.value}`
  const currentPath = route.path

  return [
    {
      label: t('server.console.title'),
      icon: 'i-lucide-terminal',
      to: `${basePath}/console`,
      active: currentPath === `${basePath}/console`,
    },
    {
      label: t('server.activity.title'),
      icon: 'i-lucide-activity',
      to: `${basePath}/activity`,
      active: currentPath === `${basePath}/activity`,
    },
    {
      label: t('server.files.title'),
      icon: 'i-lucide-folder-open',
      to: `${basePath}/files`,
      active: currentPath.startsWith(`${basePath}/files`),
    },
    {
      label: t('server.backups.title'),
      icon: 'i-lucide-database-backup',
      to: `${basePath}/backups`,
      active: currentPath.startsWith(`${basePath}/backups`),
    },
    {
      label: t('server.schedules.title'),
      icon: 'i-lucide-calendar-clock',
      to: `${basePath}/schedules`,
      active: currentPath.startsWith(`${basePath}/schedules`),
    },
    {
      label: t('server.users.title'),
      icon: 'i-lucide-users',
      to: `${basePath}/users`,
      active: currentPath.startsWith(`${basePath}/users`),
    },
    {
      label: t('server.databases.title'),
      icon: 'i-lucide-database',
      to: `${basePath}/databases`,
      active: currentPath.startsWith(`${basePath}/databases`),
    },
    {
      label: t('server.network.title'),
      icon: 'i-lucide-network',
      to: `${basePath}/network`,
      active: currentPath.startsWith(`${basePath}/network`),
    },
    {
      label: t('server.startup.title'),
      icon: 'i-lucide-rocket',
      to: `${basePath}/startup`,
      active: currentPath.startsWith(`${basePath}/startup`),
    },
    {
      label: t('server.settings.title'),
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
      :toggle="{ icon: 'i-lucide-menu', label: t('layout.serverNavigation'), color: 'neutral', variant: 'ghost' }"
      :ui="{ body: 'flex flex-col gap-1 px-2 pb-4', header: 'px-4 py-4', footer: 'border-t border-default px-4 py-3' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/server" class="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
          <UIcon v-if="collapsed" name="i-lucide-arrow-left" class="mx-auto size-4" />
          <template v-else>
            <UIcon name="i-lucide-arrow-left" class="size-3" />
            {{ t('layout.backToServers') }}
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
              <h1 class="text-xl font-semibold text-foreground">{{ serverName }}</h1>
              <p class="text-xs text-muted-foreground">{{ serverIdentifier }}</p>
            </div>
            <div class="flex items-center gap-2">
              <UButton icon="i-lucide-cog" variant="ghost" color="neutral" :to="`/server/${serverId.value}/settings`">
                {{ t('server.settings.title') }}
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
