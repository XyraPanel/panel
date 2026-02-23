<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { DashboardResponse } from '#shared/types/admin';

definePageMeta({
  adminTitle: 'Dashboard',
  adminSubtitle: 'Infrastructure overview',
});

const { t } = useI18n();
const requestFetch = useRequestFetch();

function getDefaultDashboard(): DashboardResponse {
  return {
    metrics: [],
    nodes: [],
    incidents: [],
    operations: [],
    generatedAt: new Date().toISOString(),
  };
}

const dashboardFetch = await useAsyncData<Pick<DashboardResponse, 'metrics' | 'nodes'>>(
  'admin-dashboard-critical',
  async () => {
    const response = await requestFetch<{ data: DashboardResponse } | DashboardResponse>(
      '/api/admin/dashboard',
      {
        query: { section: 'critical' },
      },
    );
    const payload = 'data' in response ? response.data : response;
    return {
      metrics: payload.metrics ?? [],
      nodes: payload.nodes ?? [],
    };
  },
  {
    default: () => ({
      metrics: [],
      nodes: [],
    }),
    dedupe: 'defer',
    transform: (value) => ({
      metrics: value.metrics ?? [],
      nodes: value.nodes ?? [],
    }),
  },
);

const secondaryDashboardFetch = useLazyAsyncData<Pick<DashboardResponse, 'incidents'>>(
  'admin-dashboard-secondary',
  async () => {
    const response = await requestFetch<{ data: DashboardResponse } | DashboardResponse>(
      '/api/admin/dashboard',
      {
        query: { section: 'incidents' },
      },
    );
    const payload = 'data' in response ? response.data : response;
    return {
      incidents: payload.incidents ?? [],
    };
  },
  {
    default: () => ({
      incidents: [],
    }),
    dedupe: 'defer',
    server: false,
    immediate: false,
    transform: (value) => ({
      incidents: value.incidents ?? [],
    }),
  },
);

const metrics = computed(() => dashboardFetch.data.value?.metrics ?? []);
const nodes = computed(() => dashboardFetch.data.value?.nodes ?? []);
const incidents = computed(() => secondaryDashboardFetch.data.value?.incidents ?? []);
const operations = computed(() => [] as DashboardResponse['operations']);
const loading = computed(() => dashboardFetch.pending.value);
const loadingSecondary = computed(() => secondaryDashboardFetch.pending.value);
const showCriticalSkeleton = computed(
  () => loading.value && metrics.value.length === 0 && nodes.value.length === 0,
);
const showIncidentSkeleton = computed(() => loadingSecondary.value && incidents.value.length === 0);
const error = computed<string | null>(() => {
  const err = dashboardFetch.error.value;
  if (!err) {
    return null;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return t('admin.dashboard.failedToLoadDashboard');
});

function getIncidentActorLabel(incident: DashboardResponse['incidents'][number]): string {
  return incident.actorEmail || incident.actorUsername || incident.actor;
}

onMounted(() => {
  void Promise.all([prefetchComponents('/admin/users'), prefetchComponents('/admin/servers')]);

  void secondaryDashboardFetch.execute();
});
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <template v-if="showCriticalSkeleton">
              <UCard v-for="i in 4" :key="`metric-skeleton-${i}`" :ui="{ body: 'space-y-3' }">
                <USkeleton class="h-4 w-24" />
                <USkeleton class="h-8 w-20" />
                <USkeleton class="h-3 w-16" />
              </UCard>
            </template>
            <template v-else-if="error">
              <UCard :ui="{ body: 'space-y-3' }">
                <p class="text-sm text-destructive">{{ error }}</p>
              </UCard>
            </template>
            <template v-else-if="metrics.length === 0">
              <UCard :ui="{ body: 'space-y-3' }">
                <p class="text-sm text-muted-foreground">{{ t('admin.dashboard.noMetrics') }}</p>
              </UCard>
            </template>
            <template v-else>
              <UCard v-for="metric in metrics" :key="metric.key" :ui="{ body: 'space-y-3' }">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ metric.label }}
                    </p>
                    <p class="mt-2 text-2xl font-semibold">{{ metric.value }}</p>
                  </div>
                  <UIcon :name="metric.icon" class="size-6 text-primary" />
                </div>
                <div class="text-xs text-muted-foreground">
                  <span>{{ metric.helper ?? t('admin.dashboard.noAdditionalContext') }}</span>
                </div>
              </UCard>
            </template>
          </div>

          <div class="grid gap-4 xl:grid-cols-2 items-start">
            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">{{ t('admin.dashboard.nodeHealth') }}</h2>
                  <UBadge :color="loading ? 'neutral' : 'primary'" :variant="'soft'">
                    {{
                      loading
                        ? t('admin.dashboard.loading')
                        : t('admin.dashboard.tracked', { count: nodes.length })
                    }}
                  </UBadge>
                </div>
              </template>

              <div class="divide-y divide-default">
                <div v-if="showCriticalSkeleton" class="space-y-3 p-4">
                  <USkeleton v-for="i in 3" :key="`node-skeleton-${i}`" class="h-12 w-full" />
                </div>
                <div v-else-if="error" class="p-4 text-sm text-destructive">{{ error }}</div>
                <div v-else-if="nodes.length === 0" class="p-4 text-sm text-muted-foreground">
                  {{ t('admin.dashboard.noNodes') }}
                </div>
                <template v-else>
                  <div
                    v-for="node in nodes"
                    :key="node.id"
                    class="flex flex-col gap-2 px-2 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-semibold">{{ node.name }}</h3>
                        <UBadge
                          size="sm"
                          variant="subtle"
                          :color="
                            node.status === 'online'
                              ? 'success'
                              : node.status === 'maintenance'
                                ? 'warning'
                                : 'warning'
                          "
                        >
                          {{
                            node.status === 'online'
                              ? t('admin.dashboard.online')
                              : node.status === 'maintenance'
                                ? t('admin.dashboard.maintenance')
                                : t('admin.dashboard.unknown')
                          }}
                        </UBadge>
                      </div>
                      <p class="text-xs text-muted-foreground">{{ node.fqdn }}</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span class="inline-flex items-center gap-1">
                        <UIcon name="i-lucide-hard-drive" class="size-3" />
                        {{
                          node.serverCount !== null
                            ? t('admin.dashboard.servers', { count: node.serverCount })
                            : t('admin.dashboard.unknownServers')
                        }}
                      </span>
                      <span
                        v-if="node.maintenanceMode"
                        class="inline-flex items-center gap-1 text-warning"
                      >
                        <UIcon name="i-lucide-cone" class="size-3" />
                        {{ t('admin.dashboard.maintenanceMode') }}
                      </span>
                      <span
                        v-if="node.issue"
                        class="inline-flex items-center gap-1 text-destructive"
                      >
                        <UIcon name="i-lucide-alert-triangle" class="size-3" /> {{ node.issue }}
                      </span>
                      <span v-if="node.lastSeenAt" class="inline-flex items-center gap-1">
                        <UIcon name="i-lucide-clock" class="size-3" />
                        <NuxtTime :datetime="node.lastSeenAt" relative relative-style="long" />
                      </span>
                    </div>
                  </div>
                </template>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">{{ t('admin.dashboard.openIncidents') }}</h2>
                  <UButton size="xs" variant="subtle" color="primary" :disabled="loading">
                    {{ t('admin.dashboard.viewAll') }}
                  </UButton>
                </div>
              </template>

              <ul class="space-y-3">
                <li v-if="showIncidentSkeleton" class="space-y-2">
                  <USkeleton v-for="i in 3" :key="`incident-skeleton-${i}`" class="h-10 w-full" />
                </li>
                <li
                  v-else-if="error"
                  class="rounded-md border border-default px-3 py-3 text-sm text-destructive"
                >
                  {{ error }}
                </li>
                <li
                  v-else-if="incidents.length === 0"
                  class="rounded-md border border-default px-3 py-3 text-sm text-muted-foreground"
                >
                  {{ t('admin.dashboard.noIncidents') }}
                </li>
                <template v-else>
                  <li
                    v-for="incident in incidents"
                    :key="incident.id"
                    class="rounded-md border border-default px-3 py-3"
                  >
                    <div
                      class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span class="text-sm font-semibold">{{ incident.action }}</span>
                      <NuxtTime :datetime="incident.occurredAt" locale="en-US" />
                    </div>
                    <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div
                        v-if="incident.actorUsername || incident.actorEmail || incident.actor"
                        class="flex items-center gap-2"
                      >
                        <UIcon name="i-lucide-user" class="size-3" />
                        <NuxtLink
                          v-if="incident.actorUserId"
                          :to="`/admin/users/${incident.actorUserId}`"
                          class="text-primary hover:underline"
                        >
                          {{ getIncidentActorLabel(incident) }}
                        </NuxtLink>
                        <span v-else>{{ getIncidentActorLabel(incident) }}</span>
                      </div>
                      <div class="flex items-center gap-2 text-muted-foreground/80">
                        <UIcon name="i-lucide-clock" class="size-3" />
                        <NuxtTime :datetime="incident.occurredAt" relative relative-style="long" />
                      </div>
                    </div>
                  </li>
                </template>
              </ul>
            </UCard>
          </div>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
