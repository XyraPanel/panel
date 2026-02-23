<template>
  <div class="space-y-8">
    <UAlert v-if="announcement" color="warning" variant="subtle" icon="i-lucide-info">
      <template #description>
        <span class="whitespace-pre-wrap">{{ announcement }}</span>
      </template>
    </UAlert>

    <div class="space-y-8">
      <section>
        <h2 class="sr-only">{{ t('dashboard.keyMetrics') }}</h2>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <template v-if="showMetricSkeleton">
            <UCard v-for="i in 2" :key="`metric-skeleton-${i}`">
              <div class="space-y-3">
                <USkeleton class="h-3 w-24" />
                <USkeleton class="h-8 w-20" />
                <USkeleton class="h-3 w-32" />
              </div>
            </UCard>
          </template>
          <template v-else-if="error">
            <UCard>
              <p class="text-sm text-destructive">{{ error }}</p>
            </UCard>
          </template>
          <template v-else-if="metrics.length === 0">
            <UCard>
              <p class="text-sm text-muted-foreground">{{ t('dashboard.noStatistics') }}</p>
            </UCard>
          </template>
          <template v-else>
            <UCard v-for="card in metrics" :key="card.key">
              <div class="flex items-start justify-between">
                <div>
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">
                    {{ card.label }}
                  </p>
                  <p class="mt-2 text-2xl font-semibold">{{ card.value }}</p>
                  <p v-if="card.delta" class="mt-1 text-xs text-muted-foreground">
                    {{ card.delta }}
                  </p>
                </div>
                <UIcon :name="card.icon" class="size-5 text-primary" />
              </div>
            </UCard>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type {
  ClientDashboardMetric,
  ClientDashboardResponse,
  MeResponse,
  DashboardData,
} from '#shared/types/dashboard';
import type { AccountSessionsResponse } from '#shared/types/auth';
import type { SecuritySettings } from '#shared/types/admin';

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const authStore = useAuthStore();
const isAdminUser = computed(() => authStore.isAdmin || authStore.user?.role === 'admin');

const isHydrated = ref(false);
const defaultSecuritySettings: SecuritySettings = {
  enforceTwoFactor: false,
  maintenanceMode: false,
  maintenanceMessage: '',
  announcementEnabled: false,
  announcementMessage: '',
  sessionTimeoutMinutes: 60,
  queueConcurrency: 4,
  queueRetryLimit: 3,
};

const [meFetch, dashboardFetch, sessionsFetch, securityFetch] = await Promise.all([
  useFetch<MeResponse>('/api/me', {
    key: 'dashboard-me',
    dedupe: 'defer',
  }),
  useFetch<ClientDashboardResponse>('/api/dashboard', {
    key: 'dashboard-data',
    query: { section: 'metrics' },
    dedupe: 'defer',
  }),
  useFetch<AccountSessionsResponse>('/api/account/sessions', {
    key: 'dashboard-sessions',
    dedupe: 'defer',
  }),
  useAsyncData<SecuritySettings>(
    'dashboard-security-settings',
    async () => {
      if (!isAdminUser.value) {
        return defaultSecuritySettings;
      }

      return await $fetch<SecuritySettings>('/api/admin/settings/security');
    },
    {
      default: () => defaultSecuritySettings,
      watch: [isAdminUser],
    },
  ),
]);

const { data: meData, error: meError } = meFetch;

const { data: dashboardResponse, error: dashboardError } = dashboardFetch;

const { data: sessionsResponse } = sessionsFetch;

const { data: securitySettings } = securityFetch;

onMounted(() => {
  isHydrated.value = true;
});

if (import.meta.client) {
  if (isAdminUser.value) {
    void callOnce(async () => {
      await prefetchComponents('/admin');
    });
  }

  void callOnce(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await refreshNuxtData([
      'dashboard-me',
      'dashboard-data',
      'dashboard-sessions',
      'dashboard-security-settings',
    ]);
  });
}

const announcement = computed(() =>
  securitySettings.value?.announcementEnabled
    ? securitySettings.value?.announcementMessage?.trim()
    : '',
);

function translateMetric(metric: ClientDashboardMetric): ClientDashboardMetric {
  // Translate label based on metric key
  let translatedLabel = metric.label;
  let translatedDelta = metric.delta;

  switch (metric.key) {
    case 'servers-active':
      translatedLabel = t('dashboard.activeServers');
      if (metric.delta) {
        if (metric.delta.includes('No servers deployed')) {
          translatedDelta = t('dashboard.noServersDeployed');
        } else if (metric.delta.includes('registered')) {
          const match = metric.delta.match(/(\d+)/);
          const count = match ? match[1] : '0';
          translatedDelta = t('dashboard.serversRegistered', { count });
        }
      }
      break;
    case 'schedules-active':
    case 'automationSchedules':
    case 'automation_schedules':
      translatedLabel = t('dashboard.automationSchedules');
      if (metric.delta) {
        if (metric.delta.includes('None configured')) {
          translatedDelta = t('dashboard.noneConfigured');
        } else if (metric.delta.includes('tracking')) {
          const match = metric.delta.match(/(\d+)/);
          const count = match ? match[1] : '0';
          translatedDelta = t('dashboard.schedulesTracking', { count });
        }
      }
      break;
  }

  return {
    ...metric,
    label: translatedLabel,
    delta: translatedDelta,
  };
}

const dashboardData = computed<DashboardData | null>(() => {
  if (!meData.value || !dashboardResponse.value || !sessionsResponse.value) {
    return null;
  }

  const activeSessions = Array.isArray(sessionsResponse.value.data)
    ? sessionsResponse.value.data.length
    : 0;

  const description =
    activeSessions === 0
      ? t('dashboard.noActiveSessions')
      : `${activeSessions} ${activeSessions === 1 ? t('dashboard.device') : t('dashboard.devices')} ${t('dashboard.signedIn')}`;

  const metrics = [...dashboardResponse.value.metrics].map(translateMetric);
  const replacementIndex = metrics.findIndex((metric) =>
    ['automationSchedules', 'automation_schedules', 'schedules-active'].includes(metric.key),
  );
  const sessionsMetric: ClientDashboardMetric = {
    key: 'activeSessions',
    label: t('dashboard.activeSessions'),
    value: activeSessions,
    delta: description,
    icon: 'i-lucide-users',
  };

  if (replacementIndex >= 0) {
    metrics.splice(replacementIndex, 1, sessionsMetric);
  } else {
    metrics.push(sessionsMetric);
  }

  const meUser = meData.value?.user || null;

  return {
    user: meUser,
    dashboard: {
      ...dashboardResponse.value,
      metrics,
    },
  };
});

const dashboardPending = computed(
  () => !meData.value || !dashboardResponse.value || !sessionsResponse.value,
);

const metrics = computed<ClientDashboardMetric[]>(
  () => dashboardData.value?.dashboard.metrics ?? [],
);

function toErrorMessage(err: unknown, fallback: string) {
  if (!err) {
    return null;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
    if ('data' in errObj && typeof errObj.data === 'object' && errObj.data !== null) {
      const data = errObj.data as Record<string, unknown>;
      if (typeof data.message === 'string') {
        return data.message;
      }
    }
  }
  return fallback;
}

const loading = computed(() => dashboardPending.value);
const showMetricSkeleton = computed(() => loading.value && metrics.value.length === 0);
const error = computed<string | null>(() => {
  if (meError.value) return toErrorMessage(meError.value, t('dashboard.failedToLoadUserData'));
  if (dashboardError.value)
    return toErrorMessage(dashboardError.value, t('dashboard.failedToLoadDashboard'));
  return null;
});

const fetchedUserName = computed(
  () =>
    dashboardData.value?.user?.username ||
    dashboardData.value?.user?.name ||
    dashboardData.value?.user?.email ||
    null,
);
const hydratedUserName = computed(() => authStore.displayName || fetchedUserName.value);
const userName = computed(() =>
  isHydrated.value ? hydratedUserName.value : fetchedUserName.value,
);

const welcomeTitle = computed(() => {
  if (userName.value) {
    return t('dashboard.welcomeBack', { name: userName.value });
  }
  return t('welcome');
});

watch(
  welcomeTitle,
  (newTitle) => {
    if (import.meta.client) {
      const route = useRoute();
      route.meta.title = newTitle;
      route.meta.subtitle = t('dashboard.description');
    }
  },
  { immediate: true },
);
</script>
