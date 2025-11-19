<template>
  <UPage>
    <UPageHeader
      :title="`Welcome back, ${userName}`"
      description="Manage your servers and recent activity from one place."
      :links="headerLinks"
    />

    <UPageBody class="space-y-8">
      <section>
        <h2 class="sr-only">Key metrics</h2>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <template v-if="loading">
            <UCard v-for="i in 2" :key="`metric-skeleton-${i}`">
              <div class="space-y-3">
                <USkeleton class="h-3 w-24" />
                <USkeleton class="h-8 w-20" />
                <USkeleton class="h-3 w-32" />
              </div>
            </UCard>
          </template>
          <template v-else-if="error">
            <UCard>
              <p class="text-sm text-destructive">{{ error }}</p>
            </UCard>
          </template>
          <template v-else-if="metrics.length === 0">
            <UCard>
              <p class="text-sm text-muted-foreground">No server statistics to show yet.</p>
            </UCard>
          </template>
          <template v-else>
            <UCard v-for="card in metrics" :key="card.key">
              <div class="flex items-start justify-between">
                <div>
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ card.label }}</p>
                  <p class="mt-2 text-2xl font-semibold">{{ card.value }}</p>
                  <p v-if="card.delta" class="mt-1 text-xs text-muted-foreground">{{ card.delta }}</p>
                </div>
                <UIcon :name="card.icon" class="size-5 text-primary" />
              </div>
            </UCard>
          </template>
        </div>
      </section>

      <section>
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold">Recent account activity</h2>
                <p class="text-sm text-muted-foreground">Latest actions taken on your account.</p>
              </div>
            </div>
          </template>

          <div class="space-y-3">
            <template v-if="loading">
              <div v-for="i in 3" :key="`activity-skeleton-${i}`" class="flex gap-3">
                <USkeleton class="h-10 w-10 rounded-md" />
                <div class="flex-1 space-y-2">
                  <USkeleton class="h-3 w-3/4" />
                  <USkeleton class="h-3 w-2/3" />
                  <USkeleton class="h-3 w-1/3" />
                </div>
              </div>
            </template>
            <template v-else-if="error">
              <UAlert color="error" icon="i-lucide-alert-circle" :title="error" />
            </template>
            <template v-else-if="activity.length === 0">
              <UAlert
                variant="subtle"
                icon="i-lucide-info"
                title="No recent activity"
                description="Your account activity will appear here"
              />
            </template>
            <template v-else>
              <div
                v-for="item in activity.slice(0, 5)"
                :key="item.id"
                class="flex items-start gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-elevated/50"
              >
                <div class="flex size-9 items-center justify-center rounded-md text-primary">
                  <UIcon :name="item.icon" class="size-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="text-sm font-medium truncate">{{ item.title }}</h3>
                    <NuxtTime
                      v-if="item.occurredAt"
                      :datetime="item.occurredAt"
                      relative
                      class="text-xs text-muted-foreground shrink-0"
                    />
                    <span v-else class="text-xs text-muted-foreground shrink-0">Unknown</span>
                  </div>
                  <p class="text-xs text-muted-foreground line-clamp-2">{{ item.description || 'No additional details' }}</p>
                </div>
              </div>
            </template>
          </div>
        </UCard>
      </section>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import type { ButtonProps } from '#ui/types'

import type {
  ClientDashboardMetric,
  ClientDashboardActivity,
  ClientDashboardResponse,
  MeResponse,
  DashboardData,
} from '#shared/types/dashboard'
import type { AccountSessionsResponse } from '#shared/types/auth'

definePageMeta({
  auth: true,
})

const headerLinks: ButtonProps[] = [
  {
    label: 'Account activity',
    icon: 'i-lucide-clock',
    to: '/account/activity',
    variant: 'soft',
    size: 'sm',
  },
  {
    label: 'Sessions',
    icon: 'i-lucide-shield',
    to: '/account/sessions',
    variant: 'soft',
    size: 'sm',
  },
]

const authStore = useAuthStore()
const { displayName } = storeToRefs(authStore)

const requestFetch = useRequestFetch()

const defaultDashboard: ClientDashboardResponse = {
  metrics: [],
  activity: [],
  quickLinks: [],
  maintenance: [],
  nodes: [],
  generatedAt: '',
}

const {
  data: dashboardData,
  pending: dashboardPending,
  error: dashboardError,
} = await useAsyncData<DashboardData>(
  'client-dashboard',
  async () => {
    const [meResponse, dashboardResponse, sessionsResponse] = await Promise.all([
      requestFetch<MeResponse>('/api/me'),
      requestFetch<ClientDashboardResponse>('/api/dashboard'),
      requestFetch<AccountSessionsResponse>('/api/account/sessions'),
    ])

    const activeSessions = Array.isArray((sessionsResponse as AccountSessionsResponse).data)
      ? (sessionsResponse as AccountSessionsResponse).data.length
      : 0

    const description = activeSessions === 0
      ? 'No active sessions'
      : `${activeSessions} device${activeSessions === 1 ? '' : 's'} signed in`

    const metrics = [...(dashboardResponse as ClientDashboardResponse).metrics]
    const replacementIndex = metrics.findIndex(metric => ['automationSchedules', 'automation_schedules', 'schedules-active'].includes(metric.key))
    const sessionsMetric: ClientDashboardMetric = {
      key: 'activeSessions',
      label: 'Active sessions',
      value: activeSessions,
      delta: description,
      icon: 'i-lucide-users',
    }

    if (replacementIndex >= 0) {
      metrics.splice(replacementIndex, 1, sessionsMetric)
    }
    else {
      metrics.push(sessionsMetric)
    }

    return {
      user: (meResponse as MeResponse).user,
      dashboard: {
        ...(dashboardResponse as ClientDashboardResponse),
        metrics,
      },
    }
  },
  {
    default: () => ({
      user: null,
      dashboard: defaultDashboard,
    }),
  },
)

const metrics = computed<ClientDashboardMetric[]>(() => dashboardData.value?.dashboard.metrics ?? [])
const activity = computed<ClientDashboardActivity[]>(() => dashboardData.value?.dashboard.activity ?? [])

function toErrorMessage(err: unknown, fallback: string) {
  if (!err) {
    return null
  }
  if (typeof err === 'string') {
    return err
  }
  if (err instanceof Error) {
    return err.message
  }
  if (typeof err === 'object' && err !== null && 'data' in err) {
    const data = (err as { data?: { message?: string } }).data
    if (data?.message) {
      return data.message
    }
  }
  return fallback
}

const loading = computed(() => dashboardPending.value)
const error = computed<string | null>(() => toErrorMessage(dashboardError.value, 'Failed to load dashboard overview.'))

const userName = computed(() => {
  const resolved = displayName.value
  if (resolved && resolved.length > 0) {
    return resolved
  }

  const meUser = dashboardData.value?.user ?? null
  return meUser?.username || meUser?.email || ''
})
</script>