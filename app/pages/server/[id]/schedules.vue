<script setup lang="ts">
import type { ServerSchedule } from '#shared/types/server'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const { t } = useI18n()
const serverId = computed(() => route.params.id as string)

const { data: schedulesData, pending, error } = await useAsyncData(
  `server-${serverId.value}-schedules`,
  () => $fetch<{ data: ServerSchedule[] }>(`/api/servers/${serverId.value}/schedules`),
  {
    watch: [serverId],
  },
)

const schedules = computed(() => schedulesData.value?.data || [])

function formatDate(dateString: string | null): string {
  if (!dateString) return t('server.schedules.notScheduled')

  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function getStatusColor(enabled: boolean) {
  return enabled ? 'primary' : 'warning'
}

function getStatusLabel(enabled: boolean) {
  return enabled ? t('server.schedules.enabled') : t('server.schedules.paused')
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">{{ t('server.schedules.serverSchedules', { id: serverId }) }}</p>
            <h1 class="text-xl font-semibold">{{ t('server.schedules.automatedTasks') }}</h1>
          </div>
          <div class="flex gap-2">
            <UButton icon="i-lucide-plus" color="primary" variant="soft">{{ t('server.schedules.newSchedule') }}</UButton>
          </div>
        </header>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">{{ t('server.schedules.configuredSchedules') }}</h2>
            </div>
          </template>

          <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
              <div>
                <p class="font-medium">{{ t('server.schedules.failedToLoad') }}</p>
                <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="pending" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
          </div>

          <div v-else-if="schedules.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-calendar-clock" class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-3 text-sm font-medium">{{ t('server.schedules.noSchedules') }}</p>
            <p class="mt-1 text-xs text-muted-foreground">{{ t('server.schedules.noSchedulesDescription') }}</p>
          </div>

          <div v-else class="divide-y divide-default">
            <div
              v-for="item in schedules"
              :key="item.id"
              class="flex flex-col gap-2 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold">{{ item.name }}</h3>
                  <UBadge :color="getStatusColor(item.enabled)" size="xs">
                    {{ getStatusLabel(item.enabled) }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ t('server.schedules.nextRun') }}: {{ formatDate(item.nextRunAt) }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-clock" class="size-4 text-primary" />
                  {{ t('server.schedules.cron') }}: <code class="rounded bg-muted px-2 py-0.5 text-xs">{{ item.cron }}</code>
                </span>
                <span class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-bolt" class="size-4 text-primary" />
                  {{ item.action }}
                </span>
                <span v-if="item.lastRunAt" class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-history" class="size-4 text-primary" />
                  {{ t('server.schedules.last') }}: {{ formatDate(item.lastRunAt) }}
                </span>
              </div>
            </div>
          </div>
        </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>
  </UPage>
</template>
