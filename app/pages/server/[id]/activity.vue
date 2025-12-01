<script setup lang="ts">
import type { ServerActivityEvent } from '#shared/types/server'

const { t } = useI18n()
const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const { data: activityData, pending, error } = await useFetch<{ data: ServerActivityEvent[]; generatedAt: string }>(
  `/api/servers/${serverId.value}/activity`,
  {
    watch: [serverId],
  },
)

const events = computed(() => activityData.value?.data || [])

function formatDate(dateString: string): string {
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

function getActionIcon(action: string): string {
  if (action.includes('power.start')) return 'i-lucide-play'
  if (action.includes('power.stop')) return 'i-lucide-square'
  if (action.includes('power.restart')) return 'i-lucide-rotate-cw'
  if (action.includes('console')) return 'i-lucide-terminal'
  if (action.includes('backup')) return 'i-lucide-archive'
  if (action.includes('schedule')) return 'i-lucide-clock'
  if (action.includes('database')) return 'i-lucide-database'
  if (action.includes('file')) return 'i-lucide-file'
  if (action.includes('user')) return 'i-lucide-user'
  if (action.includes('settings')) return 'i-lucide-settings'
  return 'i-lucide-activity'
}

function getActionColor(action: string): 'primary' | 'error' | 'warning' | 'neutral' {
  if (action.includes('start') || action.includes('create')) return 'primary'
  if (action.includes('stop') || action.includes('delete')) return 'error'
  if (action.includes('restart') || action.includes('update')) return 'warning'
  return 'neutral'
}

function formatAction(action: string): string {
  return action
    .split('.')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <header class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs text-muted-foreground">{{ t('server.activity.serverActivity', { id: serverId }) }}</p>
              <h1 class="text-xl font-semibold">{{ t('server.activity.auditTrail') }}</h1>
            </div>
          </header>

          <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
              <div>
                <p class="font-medium">{{ t('server.activity.failedToLoadActivity') }}</p>
                <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="pending" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
          </div>

          <UCard v-else>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('server.activity.recentEvents') }}</h2>
              </div>
            </template>

            <div v-if="events.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
              <UIcon name="i-lucide-activity" class="mx-auto size-12 text-muted-foreground/50" />
              <p class="mt-3 text-sm font-medium">{{ t('server.activity.noActivityRecorded') }}</p>
              <p class="mt-1 text-xs text-muted-foreground">{{ t('server.activity.noActivityRecordedDescription') }}</p>
            </div>

            <ul v-else class="space-y-4">
              <li
                v-for="event in events"
                :key="event.id"
                class="flex flex-col gap-3 rounded-md border border-default px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div class="flex items-start gap-3">
                  <UIcon :name="getActionIcon(event.action)" class="mt-0.5 size-4" :class="`text-${getActionColor(event.action)}`" />
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="font-semibold">{{ formatAction(event.action) }}</h3>
                      <UBadge size="xs" :color="getActionColor(event.action)">{{ event.actor }}</UBadge>
                    </div>
                    <p class="text-sm text-muted-foreground">{{ event.actorType }}</p>
                  </div>
                </div>
                <div class="flex flex-col items-start gap-1 text-xs text-muted-foreground lg:items-end">
                  <span>{{ formatDate(event.occurredAt) }}</span>
                </div>
              </li>
            </ul>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>
  </UPage>
</template>
