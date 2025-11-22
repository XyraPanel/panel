<script setup lang="ts">
import { computed } from 'vue'

import type { AdminActivityEntry } from '#shared/types/admin'
import type { AuditEventsPayload } from '#shared/types/admin-audit'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Audit log',
  adminSubtitle: 'Track panel-wide events mirrored from Wings',
})

const limit = 50

const { data, pending, error } = await useAsyncData('admin-activity', () =>
  $fetch<AuditEventsPayload>('/api/admin/audit', {
    query: { limit },
  }),
)

const activities = computed<AdminActivityEntry[]>(() => data.value?.data ?? [])
const pagination = computed(() => data.value?.pagination)

const hasMore = computed(() => Boolean(pagination.value?.hasMore))
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="space-y-1">
                  <h2 class="text-lg font-semibold">Recent activity</h2>
                  <p v-if="pagination" class="text-xs text-muted-foreground">
                    Showing {{ activities.length }} of {{ pagination.total }} events
                    <span v-if="hasMore">(fetch more from API to load additional entries)</span>
                  </p>
                </div>
                <UBadge v-if="pending" color="primary" variant="soft">Loading</UBadge>
                <UButton icon="i-lucide-download" color="primary" variant="subtle">Export CSV</UButton>
              </div>
            </template>

            <div v-if="pending" class="space-y-3 px-4 py-3">
              <USkeleton v-for="n in 4" :key="n" class="h-14" />
            </div>

            <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle" class="mx-4">
              <template #title>Unable to load audit events</template>
              <template #description>{{ error.message }}</template>
            </UAlert>

            <div v-else-if="activities.length === 0"
              class="flex flex-col items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
              <UIcon name="i-lucide-clipboard-list" class="size-6" />
              <p>No audit activity recorded yet.</p>
            </div>

            <div v-else class="divide-y divide-default">
              <div v-for="entry in activities" :key="entry.id"
                class="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-semibold">{{ entry.actor }}</span>
                    <UBadge size="sm" color="primary" variant="subtle">{{ entry.action }}</UBadge>
                  </div>
                  <p class="text-xs text-muted-foreground">{{ entry.target }}</p>
                  <details v-if="Object.keys(entry.details ?? {}).length" class="text-xs text-muted-foreground">
                    <summary class="cursor-pointer text-xs font-medium text-foreground">View metadata</summary>
                    <pre class="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-tight">
                    {{ JSON.stringify(entry.details, null, 2) }}
                  </pre>
                  </details>
                </div>
                <div class="flex flex-col items-start gap-1 text-xs text-muted-foreground md:items-end">
                  <NuxtTime :datetime="entry.occurredAt" relative class="font-medium" />
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
