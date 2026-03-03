<script setup lang="ts">
import { storeToRefs } from 'pinia';
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui';
import type { SessionUser } from '#shared/types/auth';
import type { AdminNavItem } from '#shared/types/admin';
import { useAuthStore } from '~/stores/auth';

const { t } = useI18n();
const localeSwitcher = useLocaleSwitcher();

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const ADMIN_NAV_ITEMS = computed<AdminNavItem[]>(() => [
  {
    id: 'admin-dashboard',
    label: t('admin.dashboard.title'),
    to: '/admin',
    order: 0,
  },
  {
    id: 'admin-management',
    label: 'Management',
    icon: 'i-lucide-settings-2',
    order: 10,
    children: [
      {
        id: 'admin-users',
        label: t('admin.users.title'),
        to: '/admin/users',
        permission: 'admin.users.read',
        active: route.path.startsWith('/admin/users'),
      },
      {
        id: 'admin-servers',
        label: t('admin.servers.title'),
        to: '/admin/servers',
        permission: 'admin.servers.read',
        active: route.path.startsWith('/admin/servers'),
      },
      {
        id: 'admin-api-keys',
        label: t('admin.apiKeys'),
        to: '/admin/api',
        permission: 'admin.api.read',
      },
    ],
  },
  {
    id: 'admin-infrastructure',
    label: 'Infrastructure',
    icon: 'i-lucide-network',
    order: 20,
    children: [
      {
        id: 'admin-nodes',
        label: t('admin.nodes.title'),
        to: '/admin/nodes',
        permission: 'admin.nodes.read',
        active: route.path.startsWith('/admin/nodes'),
      },
      {
        id: 'admin-locations',
        label: t('admin.locations.title'),
        to: '/admin/locations',
        permission: 'admin.locations.read',
      },
      {
        id: 'admin-database-hosts',
        label: t('admin.databaseHosts.title'),
        to: '/admin/database-hosts',
        permission: 'admin.database-hosts.read',
      },
    ],
  },
  {
    id: 'admin-configuration',
    label: 'Configuration',
    icon: 'i-lucide-wrench',
    order: 30,
    children: [
      {
        id: 'admin-service-packs',
        label: t('admin.navigation.servicePacks'),
        to: '/admin/nests',
        permission: ['admin.nests.read', 'admin.eggs.read'],
        active:
          route.path.startsWith('/admin/nests') || route.path.startsWith('/admin/eggs'),
      },
      {
        id: 'admin-mounts',
        label: t('admin.mounts.title'),
        to: '/admin/mounts',
        permission: 'admin.mounts.read',
      },
      {
        id: 'admin-settings',
        label: t('admin.settings.title'),
        to: '/admin/settings',
        permission: 'admin.settings.read',
      },
    ],
  },
  {
    id: 'admin-monitoring',
    label: 'Monitoring',
    icon: 'i-lucide-activity',
    order: 40,
    children: [
      {
        id: 'admin-activity',
        label: t('admin.navigation.auditLog'),
        to: '/admin/activity',
        permission: 'admin.activity.read',
      },
    ],
  },
]);

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
]);

const {
  user: storeUser,
  isSuperUser: storeIsSuperUser,
  status: authStatus,
  displayName,
  avatar,
} = storeToRefs(authStore);

const sessionUser = computed<SessionUser | null>(() => storeUser.value ?? null);

const { data: securitySettings } = useFetch<{ enforceTwoFactor: boolean }>(
  '/api/admin/settings/security/summary',
  {
    key: 'admin-layout-security-summary',
    lazy: true,
    default: () => ({ enforceTwoFactor: false }),
  },
);

const requiresTwoFactor = computed(() => Boolean(securitySettings.value?.enforceTwoFactor));
const hasTwoFactor = computed(() =>
  Boolean(sessionUser.value && 'useTotp' in sessionUser.value && sessionUser.value.useTotp),
);
const showTwoFactorPrompt = computed(() => requiresTwoFactor.value && !hasTwoFactor.value);

const adminTitle = computed(() => {
  const title = route.meta.adminTitle;
  if (typeof title === 'string' && title.length > 0) {
    return t(title);
  }
  return t('admin.title');
});

const adminSubtitle = computed(() => {
  const subtitle = route.meta.adminSubtitle;
  if (typeof subtitle === 'string' && subtitle.length > 0) {
    return t(subtitle);
  }
  return t('admin.navigation.infrastructureOverview');
});

const filteredNavItems = computed(() => {
  return ADMIN_NAV_ITEMS.value
    .filter((item) => storeIsSuperUser.value || authStore.hasPermission(item.permission ?? []))
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY));
});

const navAriaLabel = computed(() => t('layout.adminNavigation'));
const sidebarAriaLabel = computed(() => t('layout.adminNavigation'));
const adminHeaderLabel = computed(() => t('layout.adminHeader'));

function isLinkActive(item: AdminNavItem): boolean {
  if (item.active) return true;
  if (!item.to) return false;
  if (item.to === '/admin') return route.path === '/admin';
  if (item.to === '/') return route.path === '/';
  return route.path === item.to || route.path.startsWith(`${item.to}/`);
}

const sidebarNavItems = computed<NavigationMenuItem[][]>(() => {
  const items: NavigationMenuItem[] = filteredNavItems.value.map((item) => {
    if (item.children?.length) {
      const hasActiveChild = item.children.some((child) => isLinkActive(child));
      return {
        label: item.label,
        icon: item.icon,
        defaultOpen: hasActiveChild,
        children: item.children.map((child) => ({
          label: child.label,
          to: child.to,
          active: isLinkActive(child),
        })),
      };
    }
    return {
      label: item.label,
      icon: item.icon,
      to: item.to,
      active: isLinkActive(item),
    };
  });
  return [items];
});

const handleSignOut = async (): Promise<void> => {
  await clearNuxtData();
  await authStore.logout();
  router.push('/auth/login').catch(() => {});
};

const userLabel = computed(() => displayName.value || null);

const userAvatar = computed(() => {
  if (!authStatus.value || authStatus.value !== 'authenticated' || !sessionUser.value) {
    return null;
  }

  if (avatar.value) {
    return avatar.value;
  }

  const name = sessionUser.value.username || sessionUser.value.email || sessionUser.value.name;
  if (!name) {
    return null;
  }

  return {
    alt: name,
    text: name.slice(0, 2).toUpperCase(),
  };
});

const dashboardSearchOpen = ref(false);
const dashboardSearchTerm = ref('');
const dashboardSearchShortcut = 'meta_k';

const sidebarToggleProps = computed(() => ({
  icon: 'i-lucide-menu',
  color: 'neutral' as const,
  variant: 'ghost' as const,
  'aria-label': t('common.navigation'),
}));

const dashboardSearchGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const navigationItems: CommandPaletteItem[] = filteredNavItems.value.map((item) => ({
    id: item.id,
    label: item.label,
    suffix: item.to,
    to: item.to,
    onSelect: (evt) => {
      evt?.preventDefault?.();
      if (item.to) {
        router.push(item.to);
      }
      dashboardSearchOpen.value = false;
    },
  }));

  const clientItems: CommandPaletteItem[] = CLIENT_NAV_ITEMS.value
    .map((item) => ({
      id: item.id,
      label: item.label,
      suffix: item.to,
      to: item.to,
      onSelect: (evt) => {
        evt?.preventDefault?.();
        if (item.to) {
          router.push(item.to);
        }
        dashboardSearchOpen.value = false;
      },
    }));

  const accountItems: CommandPaletteItem[] = [
    {
      id: 'admin-account-security',
      label: t('account.security.title'),
      to: '/account/security',
      onSelect: (evt) => {
        evt?.preventDefault?.();
        navigateToSecuritySettings();
        dashboardSearchOpen.value = false;
      },
    },
    {
      id: 'admin-sign-out',
      label: t('auth.signOut'),
      onSelect: async (evt) => {
        evt?.preventDefault?.();
        await handleSignOut();
        dashboardSearchOpen.value = false;
      },
    },
  ];

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
  ];
});

const { locale, uiLocales, currentFlag, localeDropdownItems, handleLocaleChange } = localeSwitcher;
const currentYear = computed(() => new Date().getFullYear());
const accountNavItems = computed(() => [
  { label: t('account.profile.title'), to: '/account/profile' },
  { label: t('account.security.title'), to: '/account/security' },
  { label: t('account.apiKeys.title'), to: '/account/api-keys' },
  { label: t('account.sshKeys.title'), to: '/account/ssh-keys' },
  { label: t('account.sessions.title'), to: '/account/sessions' },
  { label: t('account.activity.title'), to: '/account/activity' },
]);

const navigateToSecuritySettings = async (event?: MouseEvent) => {
  event?.preventDefault?.();
  await router.push('/account/security').catch(() => {});
};
</script>

<template>
  <UDashboardGroup
    class="admin-layout min-h-screen bg-muted/15"
    storage="local"
    storage-key="admin-dashboard"
  >
    <UDashboardSidebar
      role="complementary"
      :aria-label="navAriaLabel"
      collapsible
      :toggle="sidebarToggleProps"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          to="/"
          class="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary py-1"
        >
          <UIcon name="i-lucide-arrow-left" class="size-3" />
          {{ t('layout.backToPanel') }}
        </NuxtLink>
        <UIcon v-else name="i-lucide-arrow-left" class="mx-auto size-4 text-muted-foreground" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          v-model:open="dashboardSearchOpen"
          class="w-full"
          :block="collapsed"
          :shortcut="dashboardSearchShortcut"
          :label="t('common.search')"
        />

        <UNavigationMenu
          v-for="(group, index) in sidebarNavItems"
          :key="index"
          :collapsed="collapsed"
          :items="group"
          orientation="vertical"
          :aria-label="navAriaLabel"
        />

        <div
          v-if="!collapsed"
          class="mt-auto text-[10px] uppercase tracking-wide text-muted-foreground/70 px-2 py-2"
        >
          <p class="flex items-center gap-1">
            <img src="/logo.png" alt="XyraPanel" class="h-4 w-auto" loading="lazy" />
            {{ t('layout.copyright', { year: currentYear }) }}
            <ULink href="https://xyrapanel.com" target="_blank">XyraPanel</ULink>
          </p>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="[accountNavItems, [{ label: t('auth.signOut'), click: handleSignOut, color: 'error' }]]"
          class="w-full"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-start"
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
        <header role="banner">
          <UDashboardNavbar
            :ui="{
              left: 'flex flex-col gap-0.5 text-left leading-tight sm:flex-row sm:items-baseline sm:gap-2',
              root: 'justify-between items-center px-4 py-1.5 sm:px-6 sm:py-2',
            }"
          >
            <template #left>
              <div
                v-if="adminTitle"
                class="hidden sm:flex flex-col gap-0.5 leading-tight sm:flex-row sm:items-baseline sm:gap-2"
              >
                <h1 class="text-base font-semibold text-foreground sm:text-lg truncate">
                  {{ adminTitle }}
                </h1>
                <p class="hidden text-xs text-muted-foreground sm:block truncate">
                  {{ adminSubtitle }}
                </p>
              </div>
            </template>
          </UDashboardNavbar>
        </header>

        <main class="flex-1 overflow-y-auto">
          <div class="mx-auto w-full px-4 py-3 sm:px-6 sm:py-5 space-y-4 sm:space-y-6">
            <UAlert
              v-if="showTwoFactorPrompt"
              color="warning"
              variant="subtle"
              icon="i-lucide-shield-check"
            >
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
