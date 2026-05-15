<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { NavigationMenuItem } from '@nuxt/ui';
const { t } = useI18n();
const route = useRoute();
const localePath = useLocalePath();
const runtimeConfig = useRuntimeConfig();
const maintenance = useMaintenanceStatus();
const localeSwitcher = useLocaleSwitcher();
const appName = computed(() => runtimeConfig.public.appName || 'XyraPanel');

const pageTitle = computed(() => {
  const title = route.meta.title;
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }
  return appName.value;
});

const pageSubtitle = computed(() => {
  const subtitle = route.meta.subtitle;
  if (typeof subtitle === 'string' && subtitle.length > 0) {
    return subtitle;
  }
  if (route.name === 'index' || route.path === '/') {
    return t('dashboard.description');
  }
  return null;
});

const authStore = useAuthStore();
const isHydrated = ref(false);
onMounted(() => {
  isHydrated.value = true;
});
const { user, isAdmin: isAdminRef, status: authStatus } = storeToRefs(authStore);
const signOutLoading = ref(false);

const { isImpersonating, impersonatedUserName, stopImpersonating, stopImpersonationLoading } =
  useImpersonationControls({ redirectTo: '/admin' });

const { data: securitySettings } = maintenance;

const { data: brandingSettings } = useFetch('/api/branding', {
  key: 'branding-settings',
  lazy: true,
  default: () =>
    ({
      showBrandLogo: true,
      brandLogoUrl: '/logo.png',
    }) as { showBrandLogo: boolean; brandLogoUrl: string | null },
});

const showBrandLogo = computed(() => brandingSettings.value?.showBrandLogo !== false);
const brandLogoUrl = computed(() => brandingSettings.value?.brandLogoUrl || '/logo.png');

const isMaintenanceMode = computed(() => {
  if (!securitySettings.value?.maintenanceMode) return false;
  if (authStatus.value === 'loading' || authStatus.value === 'unauthenticated') return false;
  return !isAdminRef.value;
});
const maintenanceMessage = computed(
  () => securitySettings.value?.maintenanceMessage?.trim() || t('layout.defaultMaintenanceMessage'),
);

const fallbackUserLabel = computed(() => t('common.user'));
const userLabel = computed(() => {
  if (!user.value) return t('common.user');
  return user.value.username || user.value.email || user.value.name || t('common.user');
});

const displayUserLabel = computed(() =>
  isHydrated.value ? userLabel.value : fallbackUserLabel.value,
);

const userAvatar = computed(() => {
  const label = isHydrated.value ? userLabel.value : fallbackUserLabel.value;
  return {
    alt: label,
    text: label === t('common.user') ? 'U' : label.slice(0, 2).toUpperCase(),
  };
});

async function handleSignOut() {
  if (signOutLoading.value) {
    return;
  }

  signOutLoading.value = true;
  try {
    await clearNuxtData();
    await authStore.logout();
    await navigateTo(localePath('/auth/login'));
  } catch {
    signOutLoading.value = false;
  }
}

const accountNavItems = computed<NavigationMenuItem[]>(() => [
  { label: t('account.profile.title'), to: localePath('/account/profile') },
  { label: t('account.security.title'), to: localePath('/account/security') },
  { label: t('account.apiKeys.title'), to: localePath('/account/api-keys') },
  { label: t('account.sshKeys.title'), to: localePath('/account/ssh-keys') },
  { label: t('account.sessions.title'), to: localePath('/account/sessions') },
  { label: t('account.activity.title'), to: localePath('/account/activity') },
]);

const navigationItems = computed<NavigationMenuItem[]>(() => [
  { label: t('dashboard.title'), to: localePath('index') },
  { label: t('server.list.title'), to: localePath('/server') },
  ...accountNavItems.value,
]);

const isAdminUser = computed(() => isAdminRef.value);

const { locale, uiLocales, currentFlag, localeDropdownItems, handleLocaleChange } = localeSwitcher;

const sidebarToggleProps = computed(() => ({
  icon: 'i-lucide-menu',
  color: 'neutral' as const,
  variant: 'ghost' as const,
  'aria-label': t('common.navigation'),
}));

// locale handling is shared via useLocaleSwitcher
</script>

<template>
  <UDashboardGroup
    class="default-layout min-h-screen bg-muted/30"
    storage="local"
    storage-key="client-dashboard"
  >
    <UDashboardSidebar
      role="complementary"
      :aria-label="t('layout.clientNavigation')"
      collapsible
      :toggle="sidebarToggleProps"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          :to="localePath('index')"
          class="group inline-flex items-center gap-3"
        >
          <img v-if="showBrandLogo" :src="brandLogoUrl" alt="" class="h-12 w-auto" />
          <UIcon v-else name="i-simple-icons-nuxtdotjs" class="size-5 text-primary" />
          <h1
            class="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition"
          >
            {{ appName }}
          </h1>
        </NuxtLink>
        <UIcon v-else name="i-simple-icons-nuxtdotjs" class="mx-auto size-5 text-primary" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigationItems"
          orientation="vertical"
          :aria-label="t('layout.clientNavigation')"
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="[
            accountNavItems,
            [{ label: t('auth.signOut'), click: handleSignOut, color: 'error' }],
          ]"
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
            <span v-if="!collapsed">{{ displayUserLabel }}</span>
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel :key="'dashboard-panel'" :ui="{ body: 'flex flex-1 flex-col p-0' }">
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
                v-if="pageTitle"
                class="hidden sm:flex flex-col gap-0.5 leading-tight sm:flex-row sm:items-baseline sm:gap-2"
              >
                <h1 class="text-base font-semibold text-foreground sm:text-lg truncate">
                  {{ pageTitle }}
                </h1>
                <p
                  v-if="pageSubtitle"
                  class="hidden text-xs text-muted-foreground sm:block truncate"
                >
                  {{ pageSubtitle }}
                </p>
              </div>
            </template>
            <template #right>
              <div class="flex items-center gap-2">
                <UDropdownMenu
                  v-if="uiLocales.length"
                  class="sm:hidden"
                  :items="localeDropdownItems"
                >
                  <UButton size="sm" variant="ghost" class="w-10 justify-center" @click.prevent>
                    <span class="text-lg" aria-hidden="true">{{ currentFlag }}</span>
                    <span class="sr-only">{{ t('common.language') }}</span>
                  </UButton>
                </UDropdownMenu>

                <ULocaleSelect
                  :model-value="locale"
                  :locales="uiLocales"
                  size="sm"
                  variant="ghost"
                  class="hidden w-32 sm:block"
                  @update:model-value="handleLocaleChange($event)"
                />
                <UButton
                  v-if="isHydrated && isAdminUser"
                  icon="i-lucide-shield"
                  variant="ghost"
                  color="error"
                  to="/admin"
                >
                  {{ t('admin.title') }}
                </UButton>
                <UButton
                  icon="i-lucide-log-out"
                  color="primary"
                  variant="subtle"
                  :loading="signOutLoading"
                  @click="handleSignOut"
                >
                  {{ t('auth.signOut') }}
                </UButton>
              </div>
            </template>
          </UDashboardNavbar>
        </header>

        <main class="flex-1 overflow-y-auto">
          <div
            v-if="isMaintenanceMode"
            class="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-6 py-16 text-center"
          >
            <UIcon name="i-lucide-construction" class="size-16 text-warning" />
            <div class="space-y-2">
              <h2 class="text-xl font-semibold">{{ t('layout.weArePerformingMaintenance') }}</h2>
              <p class="text-sm text-muted-foreground whitespace-pre-wrap">
                {{ maintenanceMessage }}
              </p>
            </div>
            <UButton variant="ghost" color="neutral" @click="handleSignOut">
              {{ t('auth.signOut') }}
            </UButton>
          </div>
          <div v-else class="px-4 py-5 sm:px-6 space-y-6">
            <UAlert
              v-if="isImpersonating"
              color="error"
              variant="subtle"
              icon="i-lucide-user-round-minus"
            >
              <template #title>
                {{ t('layout.impersonationBannerTitle', { user: impersonatedUserName }) }}
              </template>
              <template #description>
                {{ t('layout.impersonationBannerDescription', { user: impersonatedUserName }) }}
              </template>
              <template #actions>
                <UButton
                  size="xs"
                  color="error"
                  :loading="stopImpersonationLoading"
                  @click="() => stopImpersonating()"
                >
                  {{ t('layout.stopImpersonating') }}
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
