<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const serverId = computed(() => route.params.id as string)

const serverTitle = computed(() => {
  const title = route.meta.serverTitle
  return typeof title === 'string' && title.length > 0 ? title : `Server ${serverId.value}`
})

const navItems = computed(() => ([
  {
    label: 'Console',
    icon: 'i-lucide-terminal',
    to: `/server/${serverId.value}/console`,
  },
  {
    label: 'Activity',
    icon: 'i-lucide-activity',
    to: `/server/${serverId.value}/activity`,
  },
  {
    label: 'Files',
    icon: 'i-lucide-folder-open',
    to: `/server/${serverId.value}/files`,
  },
  {
    label: 'Backups',
    icon: 'i-lucide-database-backup',
    to: `/server/${serverId.value}/backups`,
  },
  {
    label: 'Schedules',
    icon: 'i-lucide-calendar-clock',
    to: `/server/${serverId.value}/schedules`,
  },
  {
    label: 'Users',
    icon: 'i-lucide-users',
    to: `/server/${serverId.value}/users`,
  },
  {
    label: 'Databases',
    icon: 'i-lucide-database',
    to: `/server/${serverId.value}/databases`,
  },
  {
    label: 'Network',
    icon: 'i-lucide-network',
    to: `/server/${serverId.value}/network`,
  },
  {
    label: 'Settings',
    icon: 'i-lucide-cog',
    to: `/server/${serverId.value}/settings`,
  },
]))
</script>

<template>
  <div class="flex min-h-screen bg-muted/20">
    <aside class="hidden w-64 shrink-0 border-r border-default bg-background lg:flex lg:flex-col">
      <div class="px-6 py-6">
        <NuxtLink to="/server" class="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
          <UIcon name="i-lucide-arrow-left" class="size-3" />
          Back to servers
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-1 px-3 pb-6">
        <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          :class="{ 'bg-primary/10 text-primary': $route.path === item.to }">
          <UIcon :name="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </aside>

    <div class="flex flex-1 flex-col">
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
    </div>
  </div>
</template>
