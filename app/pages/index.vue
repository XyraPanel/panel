<template>
  <div class="space-y-8">
    <UAlert v-if="announcement" color="warning" variant="subtle" icon="i-lucide-info">
      <template #description>
        <span class="whitespace-pre-wrap">{{ announcement }}</span>
      </template>
    </UAlert>

    <section class="space-y-8">
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ClientDashboardMetric, ClientDashboardResponse, DashboardData } from '#shared/types/dashboard';

type AccountSessionCountResponse = {
  count: number;
};

type DashboardSecuritySummary = {
  announcementEnabled: boolean;
  announcementMessage: string;
};

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const authStore = useAuthStore();
const isAdminUser = computed(() => authStore.isAdmin);

const defaultSecuritySettings: DashboardSecuritySummary = {
  announcementEnabled: false,
  announcementMessage: '',
};

const [dashboardFetch, sessionCountFetch, securityFetch] = await Promise.all([
  useFetch<ClientDashboardResponse>('/api/dashboard', {
    key: 'dashboard-data',
    query: { section: 'metrics' },
    dedupe: 'defer',
  }),
  useFetch<AccountSessionCountResponse>('/api/account/sessions/count', {
    key: 'dashboard-session-count',
    dedupe: 'defer',
  }),
  useAsyncData<DashboardSecuritySummary>(
    'dashboard-security-settings',
    async () => {
      if (!isAdminUser.value) {
        return defaultSecuritySettings;
      }

      return await $fetch<DashboardSecuritySummary>('/api/admin/settings/security/summary');
    },
    {
      default: () => defaultSecuritySettings,
      watch: [isAdminUser],
    },
  ),
]);

const { data: dashboardResponse, error: dashboardError } = dashboardFetch;

const { data: sessionCountResponse } = sessionCountFetch;

const { data: securitySettings } = securityFetch;

if (import.meta.client && isAdminUser.value) {
  void callOnce(async () => {
    await prefetchComponents('/admin');
  });
}

const announcement = computed(() =>
  securitySettings.value?.announcementEnabled
    ? securitySettings.value?.announcementMessage?.trim()
    : '',
);

function translateMetric(metric: ClientDashboardMetric): ClientDashboardMetric {
  switch (metric.key) {
    case 'servers-active':
      return { ...metric, label: t('dashboard.activeServers') };
    case 'schedules-active':
    case 'automationSchedules':
    case 'automation_schedules':
      return { ...metric, label: t('dashboard.automationSchedules') };
    default:
      return metric;
  }
}

const dashboardData = computed<DashboardData | null>(() => {
  if (!dashboardResponse.value || !sessionCountResponse.value) {
    return null;
  }

  const activeSessions = Math.max(0, sessionCountResponse.value.count ?? 0);

  const metrics = [...dashboardResponse.value.metrics].map(translateMetric);
  const replacementIndex = metrics.findIndex((metric) =>
    ['automationSchedules', 'automation_schedules', 'schedules-active'].includes(metric.key),
  );
  const sessionsMetric: ClientDashboardMetric = {
    key: 'activeSessions',
    label: t('dashboard.activeSessions'),
    value: activeSessions,
    delta: '',
    icon: 'i-lucide-users',
  };

  if (replacementIndex >= 0) {
    metrics.splice(replacementIndex, 1, sessionsMetric);
  } else {
    metrics.push(sessionsMetric);
  }

  return {
    user: authStore.user ?? null,
    dashboard: {
      ...dashboardResponse.value,
      metrics,
    },
  };
});

const dashboardPending = computed(() => !dashboardResponse.value || !sessionCountResponse.value);

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
  if (typeof err === 'object') {
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
  if (dashboardError.value)
    return toErrorMessage(dashboardError.value, t('dashboard.failedToLoadDashboard'));
  return null;
});

const userName = computed(() => authStore.displayName || null);

const welcomeTitle = computed(() =>
  userName.value ? t('dashboard.welcomeBack', { name: userName.value }) : t('welcome'),
);

useHead(() => ({
  title: welcomeTitle.value,
  meta: [{ name: 'description', content: t('dashboard.description') }],
}));

</script>
