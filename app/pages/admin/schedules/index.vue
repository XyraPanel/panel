<script setup lang="ts">
import type { AdminScheduleResponse } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Schedules',
  adminSubtitle: 'Review panel automation synced to Wings tasks',
})

const {
  data: schedulesResponse,
  pending: schedulesPending,
  error: schedulesError,
} = await useAsyncData('admin-schedules', () => $fetch<{ data: AdminScheduleResponse[] }>('/api/admin/schedules'))

const schedules = computed(() => schedulesResponse.value?.data ?? [])

function statusColor(enabled: boolean) {
  return enabled ? 'primary' : 'neutral'
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
                <h2 class="text-lg font-semibold">Schedules</h2>
                <UBadge :color="schedulesPending ? 'neutral' : 'primary'" variant="outline">
                  {{ schedulesPending ? 'Loading…' : `${schedules.length} found` }}
                </UBadge>
              </div>
            </template>

            <div class="overflow-hidden rounded-lg border border-default">
              <div
                class="grid grid-cols-12 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span class="col-span-3">Name</span>
                <span class="col-span-3">Server</span>
                <span class="col-span-2">Cron</span>
                <span class="col-span-2">Next run</span>
                <span class="col-span-2">Last run</span>
                <span class="col-span-1">Status</span>
              </div>
              <div v-if="schedulesPending" class="space-y-2 p-4">
                <USkeleton v-for="i in 4" :key="i" class="h-10 w-full" />
              </div>
              <div v-else-if="schedulesError" class="p-4 text-sm text-destructive">
                Failed to load schedules.
              </div>
              <div v-else-if="schedules.length === 0" class="p-4 text-sm text-muted-foreground">
                No schedules found.
              </div>
              <div v-else class="divide-y divide-default">
                <div v-for="schedule in schedules" :key="schedule.id" class="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                  <div class="col-span-3 space-y-1">
                    <p class="font-semibold">{{ schedule.name }}</p>
                    <p class="text-xs text-muted-foreground">ID: {{ schedule.id }}</p>
                  </div>
                  <span class="col-span-3 text-xs text-muted-foreground">{{ schedule.serverName }}</span>
                  <span class="col-span-2 text-xs text-muted-foreground">{{ schedule.cron }}</span>
                  <span class="col-span-2 text-xs text-muted-foreground">{{ schedule.nextRun ?? 'N/A' }}</span>
                  <span class="col-span-2 text-xs text-muted-foreground">{{ schedule.lastRun ?? 'Never' }}</span>
                  <div class="col-span-1">
                    <UBadge :color="statusColor(schedule.enabled)" size="xs">
                      {{ schedule.enabled ? 'Active' : 'Paused' }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
