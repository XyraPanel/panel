<script setup lang="ts">
import { ref } from 'vue'
import type { DashboardResponse } from '#shared/types/admin-dashboard'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Dashboard',
  adminSubtitle: 'Infrastructure overview sourced from Wings metrics',
})

const metrics = ref<DashboardResponse['metrics']>([])
const nodes = ref<DashboardResponse['nodes']>([])
const incidents = ref<DashboardResponse['incidents']>([])
const operations = ref<DashboardResponse['operations']>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchDashboard() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<DashboardResponse>('/api/admin/dashboard')
    metrics.value = response.metrics
    nodes.value = response.nodes
    incidents.value = response.incidents
    operations.value = response.operations
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
}

fetchDashboard()

function relativeTime(value: string | null): string {
  if (!value) {
    return 'Unknown'
  }

  const date = new Date(value)
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

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Unknown'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleString()
}
</script>

<template>
  <UPage>
    <UPageBody>
      <section class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <template v-if="loading">
            <UCard v-for="i in 4" :key="`metric-skeleton-${i}`" :ui="{ body: 'space-y-3' }">
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-8 w-20" />
              <USkeleton class="h-3 w-16" />
            </UCard>
          </template>
          <template v-else-if="error">
            <UCard :ui="{ body: 'space-y-3' }">
              <p class="text-sm text-destructive">{{ error }}</p>
            </UCard>
          </template>
          <template v-else-if="metrics.length === 0">
            <UCard :ui="{ body: 'space-y-3' }">
              <p class="text-sm text-muted-foreground">No dashboard metrics available.</p>
            </UCard>
          </template>
          <template v-else>
            <UCard v-for="metric in metrics" :key="metric.key" :ui="{ body: 'space-y-3' }">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ metric.label }}</p>
                  <p class="mt-2 text-2xl font-semibold">{{ metric.value }}</p>
                </div>
                <UIcon :name="metric.icon" class="size-6 text-primary" />
              </div>
              <div class="text-xs text-muted-foreground">
                <span>{{ metric.helper ?? 'No additional context' }}</span>
              </div>
            </UCard>
          </template>
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <UCard :ui="{ body: 'space-y-3' }" class="xl:col-span-2">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Node health</h2>
                <UBadge :color="loading ? 'neutral' : 'primary'">
                  {{ loading ? 'Loading…' : `${nodes.length} tracked` }}
                </UBadge>
              </div>
            </template>

            <div class="divide-y divide-default">
              <div v-if="loading" class="space-y-3 p-4">
                <USkeleton v-for="i in 3" :key="`node-skeleton-${i}`" class="h-12 w-full" />
              </div>
              <div v-else-if="error" class="p-4 text-sm text-destructive">
                {{ error }}
              </div>
              <div v-else-if="nodes.length === 0" class="p-4 text-sm text-muted-foreground">
                No Wings nodes found. Add a node to begin tracking infrastructure.
              </div>
              <template v-else>
                <div v-for="node in nodes" :key="node.id"
                  class="flex flex-col gap-2 px-2 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-semibold">{{ node.name }}</h3>
                      <UBadge size="xs"
                        :color="node.status === 'online' ? 'primary' : node.status === 'maintenance' ? 'warning' : 'warning'">
                        {{ node.status === 'online' ? 'Online' : node.status === 'maintenance' ? 'Maintenance' :
                        'Unknown' }}
                      </UBadge>
                    </div>
                    <p class="text-xs text-muted-foreground">{{ node.fqdn }}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span class="inline-flex items-center gap-1">
                      <UIcon name="i-lucide-hard-drive" class="size-3" />
                      {{ node.serverCount !== null ? `${node.serverCount} servers` : 'Unknown servers' }}
                    </span>
                    <span v-if="node.maintenanceMode" class="inline-flex items-center gap-1 text-warning">
                      <UIcon name="i-lucide-cone" class="size-3" /> Maintenance mode
                    </span>
                    <span v-if="node.issue" class="inline-flex items-center gap-1 text-destructive">
                      <UIcon name="i-lucide-alert-triangle" class="size-3" /> {{ node.issue }}
                    </span>
                    <span v-if="node.lastSeenAt" class="inline-flex items-center gap-1">
                      <UIcon name="i-lucide-clock" class="size-3" /> Last seen {{ relativeTime(node.lastSeenAt) }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </UCard>

          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Open incidents</h2>
                <UButton size="xs" variant="ghost" color="neutral" :disabled="loading">View all</UButton>
              </div>
            </template>

            <ul class="space-y-3">
              <li v-if="loading" class="space-y-2">
                <USkeleton v-for="i in 3" :key="`incident-skeleton-${i}`" class="h-10 w-full" />
              </li>
              <li v-else-if="error" class="rounded-md border border-default px-3 py-3 text-sm text-destructive">
                {{ error }}
              </li>
              <li v-else-if="incidents.length === 0"
                class="rounded-md border border-default px-3 py-3 text-sm text-muted-foreground">
                No recent audit events logged.
              </li>
              <template v-else>
                <li v-for="incident in incidents" :key="incident.id"
                  class="rounded-md border border-default px-3 py-3">
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span class="text-sm font-semibold">{{ incident.action }}</span>
                    <span class="text-xs text-muted-foreground">
                      {{ formatTimestamp(incident.occurredAt) }}
                    </span>
                  </div>
                  <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-target" class="size-3" />
                      <span>{{ incident.target ?? 'No target recorded' }}</span>
                    </div>
                    <div v-if="incident.actor" class="flex items-center gap-2">
                      <UIcon name="i-lucide-user" class="size-3" />
                      <span>{{ incident.actor }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-muted-foreground/80">
                      <UIcon name="i-lucide-clock" class="size-3" />
                      <span>{{ relativeTime(incident.occurredAt) }}</span>
                    </div>
                  </div>
                </li>
              </template>
            </ul>
          </UCard>
        </div>

        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Operations</h2>
            </div>
          </template>

          <ul class="space-y-3">
            <li v-if="loading" class="space-y-2">
              <USkeleton v-for="i in 3" :key="`operation-skeleton-${i}`" class="h-10 w-full" />
            </li>
            <li v-else-if="error" class="rounded-md border border-default px-4 py-3 text-sm text-destructive">
              {{ error }}
            </li>
            <li v-else-if="operations.length === 0"
              class="rounded-md border border-default px-4 py-3 text-sm text-muted-foreground">
              No recommended operations at this time.
            </li>
            <template v-else>
              <li v-for="operation in operations" :key="operation.key"
                class="flex flex-col gap-1 rounded-md border border-default px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="text-sm font-semibold">{{ operation.label }}</p>
                  <p class="text-xs text-muted-foreground">{{ operation.detail }}</p>
                </div>
              </li>
            </template>
          </ul>
        </UCard>
      </section>
    </UPageBody>

    <template #right />
  </UPage>
</template>