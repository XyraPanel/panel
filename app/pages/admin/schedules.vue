<script setup lang="ts">
import type { AdminScheduleResponse } from '#shared/types/admin';

definePageMeta({
  auth: true,
  adminTitle: 'Schedules',
  adminSubtitle: 'Review panel automation (Wings tasks & Nitro tasks)',
});

const { t: tFetch } = useI18n();
const {
  data: schedulesResponse,
  pending: schedulesPending,
  error: schedulesError,
} = await useFetch<{ data: AdminScheduleResponse[] }>('/api/admin/schedules', {
  key: 'admin-schedules',
  default: () => ({ data: [] }),
});

const schedules = computed<AdminScheduleResponse[]>(() => {
  const response = schedulesResponse.value;
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data)
  ) {
    return response.data;
  }
  return [];
});

function statusColor(enabled: boolean) {
  return enabled ? 'success' : 'error';
}

const { t } = useI18n();
const expandedEntries = ref<Set<string>>(new Set());
const toast = useToast();

function toggleEntry(id: string) {
  if (expandedEntries.value.has(id)) {
    expandedEntries.value.delete(id);
  } else {
    expandedEntries.value.add(id);
  }
}

function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return 'null';
  return JSON.stringify(data, null, 2);
}

function getFullScheduleData(schedule: AdminScheduleResponse) {
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    serverName: schedule.serverName,
    cron: schedule.cron,
    nextRun: schedule.nextRun,
    lastRun: schedule.lastRun,
    enabled: schedule.enabled,
    type: schedule.type,
  };
}

async function copyJson(schedule: AdminScheduleResponse) {
  const json = formatJson(getFullScheduleData(schedule));
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = json;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
    });
  } catch (error) {
    toast.add({
      title: t('common.failedToCopy'),
      description: error instanceof Error ? error.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-end">
                <UBadge v-if="schedulesPending" color="primary" variant="soft">
                  {{ t('common.loading') }}
                </UBadge>
              </div>
            </template>

            <template v-if="schedulesPending && schedules.length === 0">
              <div class="space-y-2">
                <USkeleton v-for="i in 5" :key="`schedule-skeleton-${i}`" class="h-14 w-full" />
              </div>
            </template>
            <template v-else-if="schedulesError">
              <UAlert color="error" icon="i-lucide-alert-triangle">
                <template #title>{{ t('admin.schedules.unableToLoadSchedules') }}</template>
                <template #description>{{ schedulesError }}</template>
              </UAlert>
            </template>
            <UEmpty
              v-else-if="schedules.length === 0"
              icon="i-lucide-calendar-clock"
              :title="t('admin.schedules.noSchedulesFound')"
              :description="t('admin.schedules.noSchedulesFoundDescription')"
            />
            <template v-else>
              <div class="space-y-3">
                <div
                  v-for="schedule in schedules"
                  :key="schedule.id"
                  class="rounded-lg border border-default overflow-hidden"
                >
                  <div
                    role="button"
                    tabindex="0"
                    class="w-full flex flex-col gap-2 p-3 text-left hover:bg-elevated/50 transition-colors md:flex-row md:items-center md:justify-between cursor-pointer"
                    @click="toggleEntry(schedule.id)"
                    @keydown.enter.prevent="toggleEntry(schedule.id)"
                    @keydown.space.prevent="toggleEntry(schedule.id)"
                  >
                    <div class="flex-1 min-w-0 flex items-center gap-3">
                      <UIcon
                        :name="
                          expandedEntries.has(schedule.id)
                            ? 'i-lucide-chevron-down'
                            : 'i-lucide-chevron-right'
                        "
                        class="size-4 text-muted-foreground shrink-0"
                      />
                      <span class="text-sm text-muted-foreground">
                        {{ t('admin.schedules.serverName') }}:
                        <span class="font-medium text-foreground">{{ schedule.serverName }}</span>
                      </span>
                      <UBadge :color="statusColor(schedule.enabled)" variant="soft" size="sm">
                        {{ schedule.enabled ? t('common.active') : t('admin.schedules.paused') }}
                      </UBadge>
                    </div>
                    <div
                      class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground shrink-0"
                    >
                      <span>
                        {{ t('admin.schedules.cron') }}:
                        <span class="font-medium text-foreground font-mono">{{
                          schedule.cron
                        }}</span>
                      </span>
                    </div>
                  </div>

                  <div
                    v-if="expandedEntries.has(schedule.id)"
                    class="border-t border-default bg-muted/30 p-4"
                  >
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-2">
                        <p
                          class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {{ t('admin.schedules.scheduleDetails') }}
                        </p>
                        <UButton
                          variant="ghost"
                          color="secondary"
                          size="xs"
                          icon="i-lucide-copy"
                          @click.stop="copyJson(schedule)"
                        >
                          {{ t('admin.schedules.copyJson') }}
                        </UButton>
                      </div>
                      <pre
                        class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"
                      ><code>{{ formatJson(getFullScheduleData(schedule)) }}</code></pre>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border-t border-default pt-4">
                <p class="text-xs text-muted-foreground">
                  {{ t('admin.schedules.showingSchedules', { count: schedules.length }) }}
                </p>
              </div>
            </template>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
