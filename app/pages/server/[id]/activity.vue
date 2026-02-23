<script setup lang="ts">
import type { PaginatedServerActivityResponse, ServerActivityEvent } from '#shared/types/server';

const { t } = useI18n();
const route = useRoute();
const toast = useToast();

definePageMeta({
  auth: true,
});

const serverId = computed(() => route.params.id as string);
const currentPage = ref(1);
const expandedEntries = ref<Set<string>>(new Set());

const { data: paginationSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/settings/pagination',
  {
    key: 'settings-pagination',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => paginationSettings.value?.paginationLimit ?? 25);

watch(serverId, () => {
  currentPage.value = 1;
  expandedEntries.value.clear();
});

const defaultResponse = (): PaginatedServerActivityResponse => ({
  data: [],
  pagination: {
    page: 1,
    limit: itemsPerPage.value,
    total: 0,
    totalPages: 0,
  },
  generatedAt: new Date().toISOString(),
});

const {
  data: activityResponse,
  pending,
  error,
} = await useFetch<PaginatedServerActivityResponse>(
  () => `/api/client/servers/${serverId.value}/activity`,
  {
    key: () => `server-${serverId.value}-activity`,
    query: computed(() => ({
      page: currentPage.value,
      limit: itemsPerPage.value,
    })),
    default: defaultResponse,
    watch: [serverId, currentPage, itemsPerPage],
  },
);

const entries = computed<ServerActivityEvent[]>(() => activityResponse.value?.data ?? []);
const pagination = computed(
  () => activityResponse.value?.pagination ?? defaultResponse().pagination,
);

const displayError = computed(() => {
  if (!error.value) return null;
  return error.value instanceof Error
    ? error.value.message
    : t('server.activity.failedToLoadActivity');
});

function toggleEntry(id: string) {
  if (expandedEntries.value.has(id)) expandedEntries.value.delete(id);
  else expandedEntries.value.add(id);
}

function formatAction(action: string): string {
  return action
    .split('.')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatJson(data: Record<string, unknown> | null): string {
  return data ? JSON.stringify(data, null, 2) : 'null';
}

function getFullEvent(entry: ServerActivityEvent) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    actorType: entry.actorType,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
  };
}

async function copyJson(entry: ServerActivityEvent) {
  const json = formatJson(getFullEvent(entry));
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(json);
    else {
      const textArea = document.createElement('textarea');
      textArea.value = json;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }

    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
    });
  } catch (err) {
    toast.add({
      title: t('common.failedToCopy'),
      description: err instanceof Error ? err.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}

function getActionIcon(action: string): string {
  if (action.includes('power.start')) return 'i-lucide-play';
  if (action.includes('power.stop')) return 'i-lucide-square';
  if (action.includes('power.restart')) return 'i-lucide-rotate-cw';
  if (action.includes('console')) return 'i-lucide-terminal';
  if (action.includes('backup')) return 'i-lucide-archive';
  if (action.includes('schedule')) return 'i-lucide-clock';
  if (action.includes('database')) return 'i-lucide-database';
  if (action.includes('file')) return 'i-lucide-file';
  if (action.includes('user')) return 'i-lucide-user';
  if (action.includes('settings')) return 'i-lucide-settings';
  return 'i-lucide-activity';
}

function getActionColor(action: string): 'primary' | 'error' | 'warning' | 'neutral' {
  if (action.includes('start') || action.includes('create')) return 'primary';
  if (action.includes('stop') || action.includes('delete')) return 'error';
  if (action.includes('restart') || action.includes('update')) return 'warning';
  return 'neutral';
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold">{{ t('server.activity.recentEvents') }}</h2>
                <p class="text-xs text-muted-foreground">
                  {{ t('server.activity.auditDescription') }}
                </p>
              </div>
              <UBadge v-if="pagination" color="neutral" variant="soft" size="xs">
                {{ pagination.total }} {{ t('activity.total') }}
              </UBadge>
            </div>
          </template>

          <template v-if="pending">
            <div class="space-y-2">
              <USkeleton
                v-for="i in 5"
                :key="`server-activity-skeleton-${i}`"
                class="h-14 w-full"
              />
            </div>
          </template>

          <template v-else-if="displayError">
            <UAlert color="error" icon="i-lucide-alert-triangle">
              <template #title>{{ t('server.activity.failedToLoadActivity') }}</template>
              <template #description>{{ displayError }}</template>
            </UAlert>
          </template>

          <UEmpty
            v-else-if="entries.length === 0"
            icon="i-lucide-activity"
            :title="t('server.activity.noActivityRecorded')"
            :description="t('server.activity.noActivityRecordedDescription')"
            variant="subtle"
          />

          <template v-else>
            <div class="space-y-3">
              <div
                v-for="entry in entries"
                :key="entry.id"
                class="rounded-lg border border-default overflow-hidden"
              >
                <button
                  class="w-full flex flex-col gap-2 p-3 text-left hover:bg-elevated/50 transition-colors md:flex-row md:items-center md:justify-between"
                  @click="toggleEntry(entry.id)"
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="getActionIcon(entry.action)"
                        class="size-4"
                        :class="`text-${getActionColor(entry.action)}`"
                      />
                      <p class="text-sm font-medium font-mono truncate">{{ entry.action }}</p>
                      <UIcon
                        :name="
                          expandedEntries.has(entry.id)
                            ? 'i-lucide-chevron-down'
                            : 'i-lucide-chevron-right'
                        "
                        class="size-4 text-muted-foreground shrink-0"
                      />
                    </div>
                    <div
                      class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span
                        >{{ t('admin.activity.actor') }}:
                        <span class="font-medium">{{ entry.actor }}</span></span
                      >
                      <span
                        >{{ formatAction(entry.targetType) }}
                        <span v-if="entry.targetId">#{{ entry.targetId }}</span></span
                      >
                    </div>
                  </div>
                  <div class="text-xs text-muted-foreground shrink-0">
                    <NuxtTime :datetime="entry.occurredAt" relative />
                  </div>
                </button>

                <div
                  v-if="expandedEntries.has(entry.id)"
                  class="border-t border-default bg-muted/30 p-4"
                >
                  <div class="flex items-center justify-between mb-2">
                    <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {{ t('account.activity.auditLogEntry') }}
                    </p>
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-copy"
                      @click.stop="copyJson(entry)"
                    >
                      {{ t('account.activity.copyJSON') }}
                    </UButton>
                  </div>
                  <pre
                    class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"
                  >
<code>{{ formatJson(getFullEvent(entry)) }}</code>
</pre>
                </div>
              </div>
            </div>

            <div
              v-if="pagination && pagination.totalPages > 1"
              class="flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p class="text-sm text-muted-foreground">
                {{
                  t('activity.showingEvents', {
                    start: (pagination.page - 1) * pagination.limit + 1,
                    end: Math.min(pagination.page * pagination.limit, pagination.total),
                    total: pagination.total,
                  })
                }}
              </p>
              <UPagination
                v-model:page="currentPage"
                :total="pagination.total"
                :items-per-page="pagination.limit"
                size="sm"
              />
            </div>
          </template>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
