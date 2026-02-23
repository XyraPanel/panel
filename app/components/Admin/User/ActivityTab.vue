<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PaginatedActivityResponse } from '#shared/types/admin';

interface Props {
  userId: string;
  itemsPerPage: number;
}

const props = defineProps<Props>();

const { t } = useI18n();
const toast = useToast();
const requestFetch = useRequestFetch();
const activityPage = ref(1);
const expandedActivityEntries = ref<Set<string>>(new Set());

const { data: activityData } = await useAsyncData(
  `admin-user-activity-${props.userId}`,
  async () => {
    const url =
      `/api/admin/users/${props.userId}/activity?page=${activityPage.value}&limit=${props.itemsPerPage}` as string;
    return await requestFetch<PaginatedActivityResponse>(url);
  },
  {
    default: () => ({
      data: [],
      pagination: { page: 1, perPage: props.itemsPerPage, total: 0, totalPages: 0 },
    }),
    watch: [activityPage, () => props.itemsPerPage, () => props.userId],
  },
);

const activity = computed(() => activityData.value?.data ?? []);
const activityPagination = computed(() => activityData.value?.pagination);

function toggleActivityEntry(id: string) {
  if (expandedActivityEntries.value.has(id)) {
    expandedActivityEntries.value.delete(id);
  } else {
    expandedActivityEntries.value.add(id);
  }
}

function formatActivityJson(data: Record<string, unknown> | null): string {
  if (!data) return 'null';
  return JSON.stringify(data, null, 2);
}

function getFullActivityData(entry: (typeof activity.value)[0]) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    metadata: entry.details,
  };
}

async function copyActivityJson(entry: (typeof activity.value)[0]) {
  const json = formatActivityJson(getFullActivityData(entry));
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
  <UCard :ui="{ body: 'space-y-3' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ t('account.activity.recentActivity') }}</h2>
        <UBadge color="neutral" variant="soft" size="xs">
          {{ activityPagination?.total ?? 0 }} {{ t('account.activity.total') }}
        </UBadge>
      </div>
    </template>

    <UEmpty
      v-if="activity.length === 0"
      icon="i-lucide-activity"
      :title="t('account.activity.noActivity')"
      :description="t('account.activity.noActivityDescription')"
      variant="subtle"
    />
    <div v-else class="space-y-3">
      <div
        v-for="entry in activity"
        :key="entry.id"
        class="rounded-lg border border-default overflow-hidden"
      >
        <button
          class="w-full flex flex-col gap-2 p-3 text-left hover:bg-elevated/50 transition-colors md:flex-row md:items-center md:justify-between"
          @click="toggleActivityEntry(entry.id)"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium font-mono">{{ entry.action }}</p>
              <UIcon
                :name="
                  expandedActivityEntries.has(entry.id)
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
          v-if="expandedActivityEntries.has(entry.id)"
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
                @click.stop="copyActivityJson(entry)"
              >
                {{ t('account.activity.copyJSON') }}
              </UButton>
            </div>
            <pre
              class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"
            ><code>{{ formatActivityJson(getFullActivityData(entry)) }}</code></pre>
          </div>
        </div>
      </div>
      <div
        v-if="activityPagination && activityPagination.totalPages > 1"
        class="flex items-center justify-between border-t border-default pt-4"
      >
        <div class="text-sm text-muted-foreground">
          {{
            t('account.activity.showingEvents', {
              count: activityPagination.total,
            })
          }}
        </div>
        <UPagination
          v-model:page="activityPage"
          :total="activityPagination.total"
          :items-per-page="activityPagination.perPage"
          size="sm"
        />
      </div>
    </div>
  </UCard>
</template>
