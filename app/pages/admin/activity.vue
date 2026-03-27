<script setup lang="ts">
import type { AdminActivityEntry, AuditEventsPayload } from '#shared/types/admin';

definePageMeta({
  auth: true,
  adminTitle: 'admin.activity.title',
  adminSubtitle: 'admin.activity.subtitle',
});

const currentPage = ref(1);
const searchTerm = ref('');
const filterState = reactive<{ actor?: string; action?: string; targetType?: string }>({});

const itemsPerPage = usePaginationSettings();

function extractTargetType(target: string | undefined | null) {
  if (!target) return undefined;
  const [type] = target.split('#');
  return type || undefined;
}

const parsedFilters = computed(() => {
  const search = searchTerm.value.trim();

  return {
    search: search.length > 0 ? search : undefined,
    actor: filterState.actor?.trim() || undefined,
    action: filterState.action?.trim() || undefined,
    targetType: filterState.targetType?.trim() || undefined,
  } as const;
});

const {
  data,
  pending,
  error: fetchError,
} = await useLazyFetch<AuditEventsPayload>('/api/admin/audit', {
  query: computed(() => ({
    limit: itemsPerPage.value,
    page: currentPage.value,
    search: parsedFilters.value.search,
    actor: parsedFilters.value.actor,
    action: parsedFilters.value.action,
    targetType: parsedFilters.value.targetType,
  })),
  key: 'admin-activity',
  watch: [currentPage, itemsPerPage, parsedFilters],
  pick: ['data', 'pagination'] satisfies (keyof AuditEventsPayload)[],
  server: false,
});

const auditData = computed(() => data.value ?? null);

const activities = computed<AdminActivityEntry[]>(() => auditData.value?.data ?? []);
const pagination = computed(() => auditData.value?.pagination);

const { t } = useI18n();
const error = computed(() => {
  if (!fetchError.value) return null;
  return fetchError.value instanceof Error
    ? fetchError.value.message
    : t('admin.activity.failedToLoadAuditEvents');
});

const expandedEntries = ref<Set<string>>(new Set());
const sortOrder = ref<'newest' | 'oldest'>('newest');
const toast = useToast();

watch(
  () => [searchTerm.value, filterState.actor, filterState.action, filterState.targetType],
  () => {
    currentPage.value = 1;
  },
);

const sortOptions = [
  { label: t('common.newest'), value: 'newest' },
  { label: t('common.oldest'), value: 'oldest' },
];

const sortedActivities = computed(() => {
  const sorted = [...activities.value];
  if (sortOrder.value === 'newest') {
    sorted.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  } else {
    sorted.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }
  return sorted;
});

function buildOptionList(values: Set<string>) {
  return Array.from(values)
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ label: value, value }));
}

const actorOptions = computed(() => {
  const values = new Set<string>();
  activities.value.forEach((entry) => {
    if (entry.actorDisplay) values.add(entry.actorDisplay);
    else if (entry.actor) values.add(entry.actor);
  });
  return buildOptionList(values);
});

const actionOptions = computed(() => {
  const values = new Set<string>();
  activities.value.forEach((entry) => {
    if (entry.action) values.add(entry.action);
  });
  return buildOptionList(values);
});

const targetOptions = computed(() => {
  const values = new Set<string>();
  activities.value.forEach((entry) => {
    const targetType = extractTargetType(entry.target);
    if (targetType) values.add(targetType);
  });
  return buildOptionList(values);
});

const hasFilters = computed(() =>
  Boolean(
    searchTerm.value.trim() || filterState.actor || filterState.action || filterState.targetType,
  ),
);

function toggleEntry(id: string) {
  if (expandedEntries.value.has(id)) {
    expandedEntries.value.delete(id);
  } else {
    expandedEntries.value.add(id);
  }
}

function formatJson(jsonData: Record<string, unknown> | null): string {
  if (!jsonData) return 'null';
  return JSON.stringify(jsonData, null, 2);
}

function getFullAuditData(entry: (typeof activities.value)[0]) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    details: entry.details,
  };
}

async function copyJson(entry: (typeof activities.value)[0]) {
  const json = formatJson(getFullAuditData(entry));
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
  } catch (copyError) {
    toast.add({
      title: t('common.failedToCopy'),
      description: copyError instanceof Error ? copyError.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}

function convertToCsv(csvData: AdminActivityEntry[]) {
  if (!csvData.length) return '';

  const rows = csvData.map((entry) => ({
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actorDisplay || entry.actor,
    actorUserId: entry.actorUserId || '',
    actorEmail: entry.actorEmail || '',
    action: entry.action,
    target: entry.target,
    details: JSON.stringify(entry.details),
  }));

  const headers = rows.length > 0 && rows[0] ? Object.keys(rows[0]).join(',') : '';
  const values = rows
    .map((row) =>
      Object.values(row)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');

  return headers + '\n' + values;
}

function exportCsv() {
  if (activities.value.length === 0) {
    toast.add({
      title: 'No data to export',
      description: 'There are no audit events to export.',
      color: 'warning',
    });
    return;
  }

  try {
    const csv = convertToCsv(activities.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `audit-log-${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.add({
      title: 'Export successful',
      description: `Exported ${activities.value.length} audit events to CSV.`,
    });
  } catch (exportError) {
    toast.add({
      title: 'Export failed',
      description: exportError instanceof Error ? exportError.message : 'Unable to export CSV.',
      color: 'error',
    });
  }
}

function clearFilters() {
  searchTerm.value = '';
  filterState.actor = undefined;
  filterState.action = undefined;
  filterState.targetType = undefined;
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer class="pt-2 sm:pt-4">
        <section class="space-y-4 sm:space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex flex-wrap items-stretch gap-2">
                <UInput
                  v-model="searchTerm"
                  icon="i-lucide-search"
                  :placeholder="t('admin.activity.searchPlaceholder')"
                  class="flex-1 min-w-[200px]"
                />
                <USelectMenu
                  v-model="filterState.actor"
                  :items="actorOptions"
                  value-key="value"
                  label-key="label"
                  size="sm"
                  clear
                  icon="i-lucide-user"
                  class="min-w-[180px] flex-1 sm:flex-none"
                  :placeholder="t('admin.activity.actorFilterPlaceholder')"
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
                  :placeholder="t('admin.activity.actionFilterPlaceholder')"
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
                  :placeholder="t('admin.activity.targetFilterPlaceholder')"
                />
                <UButton
                  variant="ghost"
                  size="sm"
                  color="neutral"
                  :disabled="!hasFilters"
                  class="shrink-0"
                  @click="clearFilters"
                >
                  {{ t('admin.activity.clearFilters') }}
                </UButton>
                <USelect
                  v-model="sortOrder"
                  :items="sortOptions"
                  value-key="value"
                  size="sm"
                  class="w-full sm:w-32"
                  :aria-label="t('admin.activity.sortOrder')"
                />
                <UButton
                  icon="i-lucide-download"
                  color="neutral"
                  variant="outline"
                  :disabled="pending || activities.length === 0"
                  class="w-full sm:w-auto justify-center"
                  @click="exportCsv"
                >
                  {{ t('admin.activity.exportCsv') }}
                </UButton>
              </div>
            </template>

            <template v-if="pending">
              <div class="space-y-2">
                <USkeleton v-for="i in 5" :key="`activity-skeleton-${i}`" class="h-14 w-full" />
              </div>
            </template>
            <template v-else-if="error">
              <UAlert color="error" icon="i-lucide-alert-triangle">
                <template #title>Unable to load audit events</template>
                <template #description>{{ error }}</template>
              </UAlert>
            </template>
            <UEmpty
              v-else-if="activities.length === 0"
              icon="i-lucide-activity"
              :title="t('admin.activity.noActivityYet')"
              :description="t('admin.activity.noActivityYetDescription')"
            />
            <template v-else>
              <div class="space-y-3">
                <div
                  v-for="entry in sortedActivities"
                  :key="entry.id"
                  class="rounded-lg border border-default overflow-hidden"
                >
                  <div
                    class="w-full flex flex-col gap-2 p-3 text-left hover:bg-elevated/50 transition-colors md:flex-row md:items-center md:justify-between cursor-pointer"
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
                      <div class="mt-1 flex flex-wrap items-center gap-2">
                        <span class="text-xs text-muted-foreground">
                          {{ t('admin.activity.actor') }}:
                          <NuxtLink
                            v-if="entry.actorUserId"
                            :to="`/admin/users/${entry.actorUserId}`"
                            class="font-medium text-primary hover:underline"
                            @click.stop
                          >
                            {{ entry.actorDisplay || entry.actor }}
                          </NuxtLink>
                          <span v-else class="font-medium">{{
                            entry.actorDisplay || entry.actor
                          }}</span>
                        </span>
                        <span
                          v-if="entry.target && !entry.target.startsWith('user#')"
                          class="text-xs text-muted-foreground"
                        >
                          {{ t('admin.activity.target') }}:
                          <span class="font-medium">{{ entry.target }}</span>
                        </span>
                      </div>
                    </div>
                    <div class="text-xs text-muted-foreground shrink-0">
                      <NuxtTime :datetime="entry.occurredAt" relative />
                    </div>
                  </div>

                  <div
                    v-if="expandedEntries.has(entry.id)"
                    class="border-t border-default bg-muted/30 p-4"
                  >
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-2">
                        <p
                          class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {{ t('admin.activity.auditLogEntry') }}
                        </p>
                        <UButton
                          variant="ghost"
                          color="secondary"
                          size="xs"
                          icon="i-lucide-copy"
                          @click.stop="copyJson(entry)"
                        >
                          {{ t('admin.activity.copyJson') }}
                        </UButton>
                      </div>
                      <pre
                        class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"
                      ><code>{{ formatJson(getFullAuditData(entry)) }}</code></pre>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="pagination && pagination.total > itemsPerPage"
                class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-default pt-4"
              >
                <p class="text-xs text-muted-foreground">
                  {{
                    t('admin.activity.showingEvents', {
                      count: activities.length,
                      total: pagination.total,
                    })
                  }}
                </p>
                <UPagination
                  v-model:page="currentPage"
                  :total="pagination.total"
                  :items-per-page="itemsPerPage"
                  size="sm"
                />
              </div>
            </template>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
