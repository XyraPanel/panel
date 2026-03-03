<script setup lang="ts">
import { computed } from 'vue';

const { t } = useI18n();
const route = useRoute();

const serverId = computed(() => route.params.id as string);
const { server } = useServerInfo(serverId.value);

const serverName = computed(() => {
  const name = server.value?.name;
  return name && name.trim() ? name : t('common.server');
});

const serverIdentifier = computed(() => {
  const identifier = server.value?.identifier;
  return identifier || serverId.value;
});

const sidebarToggleProps = computed(() => ({
  icon: 'i-lucide-menu',
  color: 'neutral' as const,
  variant: 'ghost' as const,
  'aria-label': t('common.navigation'),
}));

const navItems = computed(() => {
  const basePath = `/server/${serverId.value}`;
  const currentPath = route.path;

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
  ];
});

const currentPageTitle = computed(() => {
  const activeItem = navItems.value.find((item) => item.active);
  return activeItem?.label || '';
});
</script>

<template>
  <UDashboardGroup
    class="server-layout min-h-screen bg-muted/20"
    storage="local"
    storage-key="server-dashboard"
  >
    <UDashboardSidebar
      role="complementary"
      :aria-label="t('layout.serverNavigation')"
      collapsible
      :toggle="sidebarToggleProps"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          to="/server"
          class="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary py-1"
        >
          <UIcon name="i-lucide-arrow-left" class="size-3" />
          {{ t('layout.backToServers') }}
        </NuxtLink>
        <UIcon v-else name="i-lucide-arrow-left" class="mx-auto size-4 text-muted-foreground" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItems"
          orientation="vertical"
          :aria-label="t('layout.serverNavigation')"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel :ui="{ body: 'flex flex-1 flex-col p-0' }">
      <template #body>
        <header role="banner">
          <UDashboardNavbar
            :ui="{
              left: 'flex flex-col gap-0.5 text-left leading-tight sm:flex-row sm:items-baseline sm:gap-2',
              root: 'justify-between items-center px-4 py-1.5 sm:px-6 sm:py-2',
            }"
          >
            <template #left>
              <div
                class="hidden flex-col gap-0.5 leading-tight sm:flex sm:flex-row sm:items-baseline sm:gap-2"
              >
                <h1 class="text-base font-semibold text-foreground sm:text-lg">
                  {{ serverName }}
                  <span v-if="currentPageTitle" class="text-sm font-normal text-muted-foreground"
                    >· {{ currentPageTitle }}</span
                  >
                </h1>
                <p class="text-xs text-muted-foreground">{{ serverIdentifier }}</p>
              </div>
            </template>
          </UDashboardNavbar>
        </header>

        <main class="flex-1 overflow-y-auto">
          <div class="w-full px-4 py-5 sm:px-6">
            <slot />
          </div>
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
