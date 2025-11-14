<template>
  <UPage>
    <UPageHeader
      :title="`Welcome back, ${userName}`"
      description="Manage your servers and recent activity from one place."
    >
      <template #actions>
        <UButton icon="i-lucide-clock" variant="soft" to="/account/activity">
          Account activity
        </UButton>
        <UButton icon="i-lucide-shield" variant="soft" to="/account/sessions">
          Sessions
        </UButton>
      </template>
    </UPageHeader>

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
            <UButton variant="soft" to="/account/activity" size="sm">See history</UButton>
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
            <UAlert icon="i-lucide-info" title="No recent activity" description="Your account activity will appear here" />
          </template>
          <template v-else>
            <div v-for="item in activity.slice(0, 5)" :key="item.id"
              class="flex items-start gap-3 rounded-lg border border-default p-3 hover:bg-elevated/50 transition-colors">
              <div class="rounded-md bg-primary/10 p-2 text-primary">
                <UIcon :name="item.icon" class="size-4" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="font-medium text-sm truncate">{{ item.title }}</h3>
                  <span class="text-xs text-muted-foreground shrink-0">{{ formatRelative(item.occurredAt) }}</span>
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
import { ref } from 'vue'

import type {
  ClientDashboardMetric,
  ClientDashboardActivity,
  ClientDashboardResponse,
} from '#shared/types/dashboard'
import type { Server } from '#shared/types/ui'

const { data: session } = useAuth()

const metrics = ref<ClientDashboardMetric[]>([])
const activity = ref<ClientDashboardActivity[]>([])
const servers = ref<Server[]>([])
const loading = ref(true)
const loadingServers = ref(true)
const error = ref<string | null>(null)
const userName = computed(() => {
  const sessionUser = session.value?.user as { username?: string | null; email?: string | null } | undefined
  const resolved = sessionUser?.username || sessionUser?.email || me.value?.user.username || me.value?.user.email
  return resolved ?? ''
})

function formatRelative(iso: string | null | undefined) {
  if (!iso) {
    return 'Unknown'
  }

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) {
    return 'In the future'
  }

  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) {
    return 'Just now'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 5) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
  }

  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`
}

async function loadDashboard() {
  loading.value = true
  error.value = null

  try {
    const data = await $fetch<ClientDashboardResponse>('/api/dashboard')
    metrics.value = data.metrics
    activity.value = data.activity
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load dashboard overview.'
  }
  finally {
    loading.value = false
  }
}

const { data: me } = await useAsyncData('me', () => $fetch<{ user: { username: string; email?: string | null } }>('/api/me'))

async function loadServers() {
  loadingServers.value = true
  try {
    const data = await $fetch<{ data: Server[] }>('/api/client/servers')
    servers.value = data.data || []
  }
  catch (err) {
    console.error('Failed to load servers:', err)
  }
  finally {
    loadingServers.value = false
  }
}

await Promise.all([loadDashboard(), loadServers()])
</script>