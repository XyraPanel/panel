<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AccountActivityItem, PaginatedAccountActivityResponse } from '#shared/types/account';

definePageMeta({
  auth: true,
  title: 'Activity',
  subtitle: 'View your recent account activity and actions',
});

const { t } = useI18n();

const currentPage = ref(1);

const { data: paginationSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/settings/pagination',
  {
    key: 'settings-pagination',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => paginationSettings.value?.paginationLimit ?? 25);

const defaultActivityResponse = (): PaginatedAccountActivityResponse => ({
  data: [],
  pagination: {
    page: 1,
    perPage: itemsPerPage.value,
    total: 0,
    totalPages: 0,
  },
  generatedAt: new Date().toISOString(),
});

const {
  data: activityResponse,
  error,
  pending,
} = await useFetch<PaginatedAccountActivityResponse>('/api/account/activity', {
  key: 'account-activity',
  query: computed(() => ({
    page: currentPage.value,
    limit: itemsPerPage.value,
  })),
  default: defaultActivityResponse,
  watch: [currentPage, itemsPerPage],
});

const entries = computed<AccountActivityItem[]>(
  () => activityResponse.value?.data ?? defaultActivityResponse().data,
);
const pagination = computed(
  () => activityResponse.value?.pagination ?? defaultActivityResponse().pagination,
);
const displayError = computed(() => {
  if (!error.value) return null;
  return error.value instanceof Error ? error.value.message : t('account.activity.failedToLoad');
});

const expandedEntries = ref<Set<string>>(new Set());
const sortOrder = ref<'newest' | 'oldest'>('newest');
const toast = useToast();

const sortOptions = [
  { label: t('common.newest'), value: 'newest' },
  { label: t('common.oldest'), value: 'oldest' },
];

const sortedEntries = computed(() => {
  const sorted = [...entries.value];
  if (sortOrder.value === 'newest') {
    sorted.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  } else {
    sorted.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }
  return sorted;
});

function toggleEntry(id: string) {
  if (expandedEntries.value.has(id)) expandedEntries.value.delete(id);
  else expandedEntries.value.add(id);
}

function formatJson(data: Record<string, unknown> | null): string {
  return data ? JSON.stringify(data, null, 2) : 'null';
}

function getFullAuditData(entry: (typeof entries.value)[0]) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    metadata: entry.metadata,
  };
}

async function copyJson(entry: (typeof entries.value)[0]) {
  const json = formatJson(getFullAuditData(entry));
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
    } else {
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
  <div>
    <UCard :ui="{ body: 'space-y-3' }">
      <div v-if="pagination" class="flex items-center justify-between">
        <UBadge color="neutral" variant="soft" size="xs">
          {{ pagination.total }} {{ t('account.activity.total') }}
        </UBadge>
        <USelect
          v-if="entries.length > 0"
          v-model="sortOrder"
          :items="sortOptions"
          value-key="value"
          class="w-40"
          :aria-label="t('common.filter')"
        />
      </div>

      <template v-if="pending">
        <div class="space-y-2">
          <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
        </div>
      </template>

      <template v-else-if="displayError">
        <div class="rounded-lg border border-dashed border-default p-4 text-sm text-destructive">
          {{ displayError }}
        </div>
      </template>

      <UEmpty
        v-else-if="entries.length === 0"
        icon="i-lucide-activity"
        :title="t('account.activity.noActivity')"
        :description="t('account.activity.noActivityDescription')"
        variant="subtle"
      />

      <template v-else>
        <div class="space-y-3">
          <div
            v-for="entry in sortedEntries"
            :key="entry.id"
            class="rounded-lg border border-default overflow-hidden"
          >
            <button
              class="w-full flex flex-col gap-2 p-3 text-left hover:bg-elevated/50 transition-colors md:flex-row md:items-center md:justify-between"
              @click="toggleEntry(entry.id)"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium font-mono">{{ entry.action }}</p>
                  <UIcon
                    :name="
                      expandedEntries.has(entry.id)
                        ? 'i-lucide-chevron-down'
                        : 'i-lucide-chevron-right'
                    "
                    class="size-4 text-muted-foreground shrink-0"
                  />
                </div>
                <p
                  v-if="entry.target && !entry.target.startsWith('user#')"
                  class="text-xs text-muted-foreground mt-1"
                >
                  {{ entry.target }}
                </p>
              </div>

              <div class="text-xs text-muted-foreground shrink-0">
                <NuxtTime :datetime="entry.occurredAt" relative />
              </div>
            </button>

            <div
              v-if="expandedEntries.has(entry.id)"
              class="border-t border-default bg-muted/30 p-4"
            >
              <div class="space-y-2">
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
<code>{{ formatJson(getFullAuditData(entry)) }}</code>
</pre>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="pagination && pagination.totalPages > 1"
          class="flex items-center justify-between border-t border-default pt-4"
        >
          <div class="text-sm text-muted-foreground">
            {{
              t('account.activity.showingEvents', {
                count: pagination.total,
              })
            }}
          </div>

          <UPagination
            v-model:page="currentPage"
            :total="pagination.total"
            :items-per-page="pagination.perPage"
            size="sm"
          />
        </div>
      </template>
    </UCard>
  </div>
</template>
