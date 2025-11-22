<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { createError } from 'h3'

definePageMeta({
  auth: true,
  layout: 'server',
})

const route = useRoute()
const router = useRouter()
const serverId = computed(() => route.params.id as string)

const { data: serverResponse, pending, error } = await useAsyncData(
  `server:${serverId.value}`,
  () => $fetch<{ data: PanelServerDetails }>(`/api/servers/${serverId.value}`),
  {
    watch: [serverId],
    immediate: true,
  },
)

const server = computed(() => serverResponse.value?.data ?? null)

const breadcrumbLinks = computed(() => ([
  { label: 'Servers', to: '/server' },
  { label: server.value?.name ?? serverId.value, to: `/server/${serverId.value}` },
]))

const primaryAllocation = computed(() => server.value?.allocations.primary ?? null)
const additionalAllocations = computed(() => server.value?.allocations.additional ?? [])

function formatAllocation(allocation: { ip: string; port: number } | null) {
  if (!allocation)
    return 'Not assigned'
  return `${allocation.ip}:${allocation.port}`
}

function formatLimit(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined)
    return '—'
  return `${value.toLocaleString()} ${suffix}`
}

function formatDate(value: string | null | undefined) {
  if (!value)
    return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

watchEffect(() => {
  if (pending.value || error.value)
    return

  if (!server.value) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }
})

watchEffect(() => {
  if (!import.meta.client)
    return

  if (!pending.value && server.value) {
    router.replace(`/server/${serverId.value}/console`)
  }
})

const infoStats = computed(() => {
  const details = server.value
  if (!details) {
    return []
  }

  return [
    { icon: 'i-lucide-server', label: 'Status', value: details.status ?? 'Unknown' },
    { icon: 'i-lucide-shield', label: 'Suspended', value: details.suspended ? 'Yes' : 'No' },
    { icon: 'i-lucide-globe', label: 'Primary allocation', value: formatAllocation(primaryAllocation.value) },
    { icon: 'i-lucide-gauge', label: 'Memory', value: formatLimit(details.limits.memory, 'MB') },
    { icon: 'i-lucide-cpu', label: 'CPU', value: formatLimit(details.limits.cpu, '%') },
    { icon: 'i-lucide-disc', label: 'Disk', value: formatLimit(details.limits.disk, 'MB') },
    { icon: 'i-lucide-timer', label: 'Created at', value: formatDate(details.createdAt) },
  ]
})
</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader
        v-if="server"
        :title="server.name"
        :description="server.description || 'No description provided.'"
      >
        <template #headline>
          <div class="flex items-center gap-2">
            <UBreadcrumb :links="breadcrumbLinks" size="xs" />
            <UBadge color="primary" size="xs">{{ server.status ?? 'Unknown' }}</UBadge>
          </div>
        </template>
      </UPageHeader>
    </UContainer>

    <UPageBody>
      <UContainer>
        <UAlert v-if="error" color="error" title="Failed to load server">
          {{ error.message }}
        </UAlert>

        <USkeleton v-else-if="pending" class="h-72 w-full" />

        <div v-else-if="server" class="space-y-6">
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Server overview</h2>
            </div>
          </template>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-foreground">General</h3>
              <p class="text-sm text-muted-foreground">{{ server.description ?? 'No description provided.' }}</p>
              <div class="text-xs text-muted-foreground">
                UUID: <span class="font-mono text-foreground">{{ server.uuid }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                Identifier: <span class="font-mono text-foreground">{{ server.identifier }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                Node: <span class="text-foreground">{{ server.node.name ?? 'Unassigned' }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                Owner: <span class="text-foreground">{{ server.owner.username ?? 'Unknown' }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <h3 class="text-sm font-medium text-foreground">Limits</h3>
              <ul class="space-y-1 text-xs text-muted-foreground">
                <li><span class="text-foreground">Memory:</span> {{ formatLimit(server.limits.memory, 'MB') }}</li>
                <li><span class="text-foreground">Disk:</span> {{ formatLimit(server.limits.disk, 'MB') }}</li>
                <li><span class="text-foreground">CPU:</span> {{ formatLimit(server.limits.cpu, '%') }}</li>
                <li><span class="text-foreground">Swap:</span> {{ formatLimit(server.limits.swap, 'MB') }}</li>
                <li><span class="text-foreground">IO:</span> {{ formatLimit(server.limits.io, 'MB/s') }}</li>
              </ul>
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Network allocations</h2>
            </div>
          </template>

          <div class="space-y-3">
            <div class="rounded-md border border-default bg-background px-3 py-3 text-sm">
              <div class="text-xs text-muted-foreground">Primary allocation</div>
              <div class="mt-1 font-mono">{{ formatAllocation(primaryAllocation) }}</div>
            </div>

            <div>
              <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional</div>
              <div v-if="additionalAllocations.length === 0" class="mt-2 text-xs text-muted-foreground">
                No additional allocations assigned.
              </div>
              <div
                v-else
                class="mt-2 grid gap-2"
              >
                <div
                  v-for="allocation in additionalAllocations"
                  :key="`${allocation.ip}:${allocation.port}`"
                  class="rounded-md border border-dashed border-default px-3 py-2 text-xs text-muted-foreground"
                >
                  <div class="font-mono text-sm text-foreground">{{ allocation.ip }}:{{ allocation.port }}</div>
                  <div>{{ allocation.description || 'No notes provided.' }}</div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

        <div v-else class="text-sm text-muted-foreground">
          Server details not available.
        </div>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside>
        <div class="space-y-4">
          <UCard :ui="{ body: 'space-y-3' }">
            <h2 class="text-sm font-semibold">At a glance</h2>
            <div
              v-for="stat in infoStats"
              :key="stat.label"
              class="rounded-md border border-default bg-background px-3 py-3"
            >
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <UIcon :name="stat.icon" class="size-4 text-primary" />
                <span>{{ stat.label }}</span>
              </div>
              <p class="mt-2 text-sm font-semibold text-foreground">{{ stat.value }}</p>
            </div>
          </UCard>
        </div>
      </UPageAside>
    </template>
  </UPage>
</template>
