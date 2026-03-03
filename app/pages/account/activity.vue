<script setup lang="ts">
import type { AccountActivityItem, PaginatedAccountActivityResponse } from '#shared/types/account';

definePageMeta({
  auth: true,
  title: 'Activity',
  subtitle: 'View your recent account activity and actions',
});

const { t } = useI18n();

const currentPage = ref(1);
const itemsPerPage = usePaginationSettings();
const searchTerm = ref('');
const filterState = reactive<{ action?: string; targetType?: string }>({});

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

const parsedFilters = computed(() => {
  const search = searchTerm.value.trim();
  return {
    search: search.length > 0 ? search : undefined,
    action: filterState.action?.trim() || undefined,
    targetType: filterState.targetType?.trim() || undefined,
  } as const;
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
    search: parsedFilters.value.search,
    action: parsedFilters.value.action,
    targetType: parsedFilters.value.targetType,
  })),
  default: defaultActivityResponse,
  watch: [currentPage, itemsPerPage, parsedFilters],
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

watch(
  () => [searchTerm.value, filterState.action, filterState.targetType],
  () => {
    currentPage.value = 1;
  },
);

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

function extractTargetType(target: string | null | undefined) {
  if (!target) return undefined;
  const [type] = target.split('#');
  return type || undefined;
}

function buildOptionList(values: Set<string>) {
  return Array.from(values)
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ label: value, value }));
}

const actionOptions = computed(() => {
  const values = new Set<string>();
  entries.value.forEach((entry) => {
    if (entry.action) values.add(entry.action);
  });
  return buildOptionList(values);
});

const targetOptions = computed(() => {
  const values = new Set<string>();
  entries.value.forEach((entry) => {
    const type = extractTargetType(entry.target ?? undefined);
    if (type) values.add(type);
  });
  return buildOptionList(values);
});

const hasFilters = computed(() =>
  Boolean(searchTerm.value.trim() || filterState.action || filterState.targetType),
);

function clearFilters() {
  searchTerm.value = '';
  filterState.action = undefined;
  filterState.targetType = undefined;
}

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
  } catch (err) {
    toast.add({
      title: t('common.failedToCopy'),
      description: err instanceof Error ? err.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}

function convertEntriesToCsv(data: AccountActivityItem[]) {
  if (!data.length) return '';

  const rows = data.map((entry) => ({
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    action: entry.action,
    target: entry.target ?? '',
    metadata: JSON.stringify(entry.metadata ?? {}),
  }));

  const headers = Object.keys(rows[0] ?? {}).join(',');
  const values = rows
    .map((row) =>
      Object.values(row)
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');

  return `${headers}\n${values}`;
}

function exportCsv() {
  if (!entries.value.length) {
    toast.add({
      title: t('common.warning'),
      description: t('account.activity.noActivity'),
      color: 'warning',
    });
    return;
  }

  try {
    const csv = convertEntriesToCsv(entries.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.setAttribute('download', `account-activity-${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.add({
      title: t('common.success'),
      description: t('common.exportCompleted') ?? 'Export completed.',
    });
  } catch (exportError) {
    toast.add({
      title: t('common.error'),
      description: exportError instanceof Error ? exportError.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}
</script>

<template>
  <div>
    <UCard :ui="{ body: 'space-y-4' }">
      <div class="flex flex-wrap items-stretch gap-2">
        <UInput
          v-model="searchTerm"
          icon="i-lucide-search"
          :placeholder="t('account.activity.searchPlaceholder')"
          class="flex-1 min-w-[200px]"
        />
        <USelectMenu
          v-model="filterState.action"
          :items="actionOptions"
          value-key="value"
          label-key="label"
          size="sm"
          clear
          icon="i-lucide-bolt"
          class="min-w-[180px] flex-1 sm:flex-none"
          :placeholder="t('account.activity.actionFilterPlaceholder')"
        />
        <USelectMenu
          v-model="filterState.targetType"
          :items="targetOptions"
          value-key="value"
          label-key="label"
          size="sm"
          clear
          icon="i-lucide-crosshair"
          class="min-w-[180px] flex-1 sm:flex-none"
          :placeholder="t('account.activity.targetFilterPlaceholder')"
        />
        <UButton
          variant="ghost"
          size="sm"
          color="neutral"
          :disabled="!hasFilters"
          class="shrink-0"
          @click="clearFilters"
        >
          {{ t('account.activity.clearFilters') }}
        </UButton>
        <USelect
          v-if="pagination && entries.length > 0"
          v-model="sortOrder"
          :items="sortOptions"
          value-key="value"
          size="sm"
          class="w-full sm:w-36"
          :aria-label="t('common.filter')"
        />
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="entries.length === 0"
          class="w-full sm:w-auto justify-center"
          @click="exportCsv"
        >
          {{ t('admin.activity.exportCsv') }}
        </UButton>
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
            <UButton
              variant="ghost"
              color="neutral"
              type="button"
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
            </UButton>

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
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-default pt-4"
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
