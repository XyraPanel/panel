<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AdminActivityEntry, AuditEventsPayload } from '#shared/types/admin';

definePageMeta({
  auth: true,
  adminTitle: 'Audit log',
  adminSubtitle: 'Track panel-wide events mirrored from Wings',
});

const currentPage = ref(1);

const { data: generalSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/admin/settings/general',
  {
    key: 'admin-settings-general',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => generalSettings.value?.paginationLimit ?? 25);

const {
  data,
  pending,
  error: fetchError,
} = await useFetch('/api/admin/audit', {
  query: computed(() => ({ limit: itemsPerPage.value, page: currentPage.value })),
  key: 'admin-activity',
  watch: [currentPage, itemsPerPage],
});

const auditData = computed(() => data.value as AuditEventsPayload | null);

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
  } catch (error) {
    toast.add({
      title: t('common.failedToCopy'),
      description: error instanceof Error ? error.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}

function convertToCsv(data: AdminActivityEntry[]) {
  if (!data.length) return '';

  const rows = data.map((entry) => ({
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
  } catch (error) {
    toast.add({
      title: 'Export failed',
      description: error instanceof Error ? error.message : 'Unable to export CSV.',
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
              <div class="flex items-center justify-between">
                <div />
                <div class="flex items-center gap-2">
                  <div v-if="activities.length > 0">
                    <USelect
                      v-model="sortOrder"
                      :items="sortOptions"
                      value-key="value"
                      class="w-40"
                      :aria-label="t('common.filter')"
                    />
                  </div>
                  <UBadge v-if="pending" color="primary" variant="soft">{{
                    t('common.loading')
                  }}</UBadge>
                  <UButton
                    icon="i-lucide-download"
                    color="neutral"
                    variant="outline"
                    :disabled="pending || activities.length === 0"
                    @click="exportCsv"
                  >
                    {{ t('admin.activity.exportCsv') }}
                  </UButton>
                </div>
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
                class="flex items-center justify-between border-t border-default pt-4"
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
