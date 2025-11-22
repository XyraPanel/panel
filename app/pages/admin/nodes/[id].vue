<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'

import type {
  AdminPaginatedMeta,
  AdminWingsNodeAllocationSummary,
  AdminWingsNodeAllocationsPayload,
  AdminWingsNodeDetail,
  AdminWingsNodeServerSummary,
  AdminWingsNodeServersPayload,
} from '#shared/types/admin-wings-node'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Node details',
  adminSubtitle: 'Inspect Wings node metrics and allocations',
})

const nodeId = computed(() => route.params.id as string)

const maintenanceActions = [
  { label: 'Sync node', icon: 'i-lucide-refresh-ccw', action: 'sync' },
  { label: 'Rotate tokens', icon: 'i-lucide-key-round', action: 'rotate' },
  { label: 'Transfer servers', icon: 'i-lucide-truck', action: 'transfer' },
]

const actionLoading = ref<string | null>(null)
const showTransferModal = ref(false)
const transferForm = reactive({
  targetNodeId: '',
  serverIds: [] as string[],
})

const { data: availableNodes } = await useAsyncData(
  'available-nodes',
  () => $fetch<{ data: Array<{ id: string; name: string }> }>('/api/wings/nodes'),
  { default: () => ({ data: [] }) },
)

const nodeOptions = computed(() => {
  return (availableNodes.value?.data ?? [])
    .filter(n => n.id !== nodeId.value)
    .map(n => ({ label: n.name, value: n.id }))
})

const tab = ref<'overview' | 'servers' | 'allocations' | 'settings' | 'configuration' | 'system'>('overview')

const toast = useToast()

const serverQuery = reactive({ page: 1, perPage: 25, search: '' })
const allocationQuery = reactive({ page: 1, perPage: 25, search: '' })

const { data: nodeResponse, pending, error, refresh: refreshNode } = await useAsyncData(
  () => `admin-node-${nodeId.value}`,
  () => $fetch<{ data: AdminWingsNodeDetail }>(`/api/admin/wings/nodes/${nodeId.value}`),
  { watch: [nodeId] },
)

const nodeDetail = computed(() => nodeResponse.value?.data)
const node = computed(() => nodeDetail.value?.node)
const stats = computed(() => nodeDetail.value?.stats)
const recentServers = computed(() => nodeDetail.value?.recentServers ?? [])
const systemInfo = computed(() => nodeDetail.value?.system ?? null)
const systemError = computed(() => nodeDetail.value?.systemError ?? null)

const serverTable = await useAsyncData(
  () => `admin-node-${nodeId.value}-servers-${serverQuery.page}-${serverQuery.perPage}-${serverQuery.search}`,
  () => $fetch<AdminWingsNodeServersPayload>(`/api/admin/wings/nodes/${nodeId.value}/servers`, {
    query: { page: serverQuery.page, perPage: serverQuery.perPage, search: serverQuery.search || undefined },
  }),
  { immediate: false },
)

const allocationTable = await useAsyncData(
  () => `admin-node-${nodeId.value}-allocations-${allocationQuery.page}-${allocationQuery.perPage}-${allocationQuery.search}`,
  () => $fetch<AdminWingsNodeAllocationsPayload>(`/api/admin/wings/nodes/${nodeId.value}/allocations`, {
    query: { page: allocationQuery.page, perPage: allocationQuery.perPage, search: allocationQuery.search || undefined },
  }),
  { immediate: false },
)

const statusBadge = computed(() => {
  if (stats.value?.maintenanceMode) {
    return { label: 'Maintenance', color: 'warning' as const }
  }

  if (node.value && !node.value.public) {
    return { label: 'Private', color: 'neutral' as const }
  }

  return { label: 'Online', color: 'primary' as const }
})

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Unknown'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function formatMegabytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 MiB'
  }

  const units = ['MiB', 'GiB', 'TiB', 'PiB']
  let current = value
  let unitIndex = 0

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  const precision = current >= 10 ? 0 : 1
  return `${current.toFixed(precision)} ${units[unitIndex]}`
}

function formatUsage(used?: number | null, total?: number | null) {
  return `${formatMegabytes(used)} / ${formatMegabytes(total)}`
}

const resourceUsage = computed(() => {
  const nodeRecord = node.value
  const statsRecord = stats.value

  return {
    memory: {
      used: statsRecord?.memoryProvisioned ?? 0,
      total: nodeRecord?.memory ?? 0,
    },
    disk: {
      used: statsRecord?.diskProvisioned ?? 0,
      total: nodeRecord?.disk ?? 0,
    },
  }
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const systemMetrics = computed(() => {
  const system = systemInfo.value
  if (!isRecord(system)) {
    return [] as { label: string; value: string }[]
  }

  const metrics: { label: string; value: string }[] = []
  const wingsVersion = system.version
  if (typeof wingsVersion === 'string' && wingsVersion.length > 0) {
    metrics.push({ label: 'Wings version', value: wingsVersion })
  }

  const systemBlock = isRecord(system.system) ? system.system : {}
  const cpuThreads = systemBlock.cpu_threads
  if (typeof cpuThreads === 'number') {
    metrics.push({ label: 'CPU threads', value: String(cpuThreads) })
  }
  const memoryBytes = systemBlock.memory_bytes
  if (typeof memoryBytes === 'number') {
    metrics.push({ label: 'Memory (physical)', value: formatMegabytes(memoryBytes / (1024 * 1024)) })
  }
  const kernelVersion = systemBlock.kernel_version
  if (typeof kernelVersion === 'string') {
    metrics.push({ label: 'Kernel', value: kernelVersion })
  }
  const osLabel = systemBlock.os
  if (typeof osLabel === 'string') {
    metrics.push({ label: 'OS', value: osLabel })
  }

  const dockerBlock = isRecord(system.docker) ? system.docker : {}
  const dockerVersion = dockerBlock.version
  if (typeof dockerVersion === 'string') {
    metrics.push({ label: 'Docker', value: dockerVersion })
  }
  const dockerStorage = isRecord(dockerBlock.storage) ? dockerBlock.storage : {}
  const storageDriver = dockerStorage.driver
  if (typeof storageDriver === 'string') {
    metrics.push({ label: 'Storage driver', value: storageDriver })
  }

  return metrics
})

const lastSeenDisplay = computed(() => formatDateTime(stats.value?.lastSeenAt))

const serverRows = computed<AdminWingsNodeServerSummary[]>(() => serverTable.data.value?.data ?? [])
const serverPagination = computed<AdminPaginatedMeta | undefined>(() => serverTable.data.value?.pagination)
const allocationRows = computed<AdminWingsNodeAllocationSummary[]>(() => allocationTable.data.value?.data ?? [])
const allocationPagination = computed<AdminPaginatedMeta | undefined>(() => allocationTable.data.value?.pagination)

watch(tab, async (value) => {
  if (value === 'servers' && !serverTable.data.value) {
    await serverTable.refresh()
  }
  if (value === 'allocations' && !allocationTable.data.value) {
    await allocationTable.execute()
  }
})

watch([() => serverQuery.page, () => serverQuery.perPage], async () => {
  if (tab.value !== 'servers') {
    return
  }
  serverQuery.page = 1
})

watchDebounced(() => serverQuery.search, async () => {
  serverQuery.page = 1
  if (tab.value !== 'servers') {
    return
  }
}, { debounce: 300, maxWait: 1000 })

watch([() => allocationQuery.page, () => allocationQuery.perPage], async () => {
  if (tab.value !== 'allocations') {
    return
  }
  allocationQuery.page = 1
})

watchDebounced(() => allocationQuery.search, async () => {
  allocationQuery.page = 1
  if (tab.value !== 'allocations') {
    return
  }
}, { debounce: 300, maxWait: 1000 })

async function handleMaintenanceAction(action: string) {
  if (!node.value) return

  actionLoading.value = action

  try {
    switch (action) {
      case 'sync': {
        const response = await $fetch<{ success: boolean; connected: boolean; message: string }>(
          `/api/admin/nodes/${nodeId.value}/test-connection`,
          { method: 'POST' },
        )

        if (response.connected) {
          toast.add({
            title: 'Node synced',
            description: 'Successfully connected to Wings daemon and updated node status.',
            color: 'success',
          })
          await refreshNode()
        } else {
          toast.add({
            title: 'Sync failed',
            description: response.message || 'Failed to connect to Wings daemon',
            color: 'error',
          })
        }
        break
      }
      case 'rotate': {
        if (!confirm('Are you sure you want to rotate the node tokens? This will require reconfiguring Wings on the node.')) {
          return
        }

        await $fetch(`/api/admin/wings/nodes/${nodeId.value}/token`, {
          method: 'POST',
        })

        toast.add({
          title: 'Tokens rotated',
          description: 'New deployment token has been generated. Update your Wings configuration.',
          color: 'success',
        })
        await refreshNode()
        break
      }
      case 'transfer': {
        showTransferModal.value = true
        break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : `Failed to ${action} node`
    toast.add({
      title: 'Error',
      description: message,
      color: 'error',
    })
  } finally {
    actionLoading.value = null
  }
}

function setTransferServerChecked(serverId: string, value: boolean | 'indeterminate') {
  const checked = value === true

  if (checked) {
    if (!transferForm.serverIds.includes(serverId))
      transferForm.serverIds.push(serverId)
  }
  else {
    transferForm.serverIds = transferForm.serverIds.filter(id => id !== serverId)
  }
}

function handleViewServer(row: AdminWingsNodeServerSummary) {
  navigateTo(`/admin/servers/${row.id}`)
}

async function handleUnlinkServer(row: AdminWingsNodeServerSummary) {
  if (!confirm(`Are you sure you want to unlink server "${row.name}" from this node? This will require manual intervention to reassign the server.`)) {
    return
  }

  try {
    // For now we'll show a warning
    toast.add({
      title: 'Unlink server',
      description: 'To unlink a server, please transfer it to another node using the server management page.',
      color: 'warning',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unlink server'
    toast.add({
      title: 'Error',
      description: message,
      color: 'error',
    })
  }
}

async function togglePrimaryAllocation(row: AdminWingsNodeAllocationSummary) {
  if (!row.serverId) {
    toast.add({
      title: 'Error',
      description: 'Cannot set primary allocation for unassigned allocation',
      color: 'error',
    })
    return
  }

  const action = row.isPrimary ? 'demote' : 'promote'
  if (!confirm(`Are you sure you want to ${action} allocation ${row.ip}:${row.port}?`)) {
    return
  }

  try {
    await $fetch(`/api/client/servers/${row.serverId}/network/allocations/${row.id}/primary`, {
      method: 'POST',
    })

    toast.add({
      title: row.isPrimary ? 'Allocation demoted' : 'Allocation promoted',
      description: `Allocation ${row.ip}:${row.port} is now ${row.isPrimary ? 'secondary' : 'primary'}.`,
      color: 'success',
    })

    await allocationTable.refresh()
    await refreshNode()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update allocation'
    toast.add({
      title: 'Error',
      description: message,
      color: 'error',
    })
  }
}

function handleTransferAllocation(row: AdminWingsNodeAllocationSummary) {
  if (!row.serverId) {
    toast.add({
      title: 'Error',
      description: 'Cannot transfer unassigned allocation. Delete it instead.',
      color: 'error',
    })
    return
  }

  toast.add({
    title: 'Transfer allocation',
    description: 'To transfer an allocation, transfer the server that uses it to another node.',
    color: 'info',
  })
}

async function handleDeleteAllocation(row: AdminWingsNodeAllocationSummary) {
  if (row.serverId) {
    toast.add({
      title: 'Cannot delete',
      description: 'Cannot delete allocation that is assigned to a server. Unassign it first.',
      color: 'error',
    })
    return
  }

  if (!confirm(`Are you sure you want to delete allocation ${row.ip}:${row.port}? This action cannot be undone.`)) {
    return
  }

  try {
    await $fetch(`/api/admin/allocations/${row.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Allocation deleted',
      description: `Allocation ${row.ip}:${row.port} has been removed.`,
      color: 'success',
    })

    await allocationTable.refresh()
    await refreshNode()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete allocation'
    toast.add({
      title: 'Error',
      description: message,
      color: 'error',
    })
  }
}

async function handleTransferServers() {
  if (!transferForm.targetNodeId || transferForm.serverIds.length === 0) {
    return
  }

  actionLoading.value = 'transfer'
  try {
    const transferPromises = transferForm.serverIds.map(serverId =>
      $fetch(`/api/admin/servers/${serverId}/transfer`, {
        method: 'POST',
        body: {
          nodeId: transferForm.targetNodeId,
        },
      }),
    )

    await Promise.all(transferPromises)

    toast.add({
      title: 'Transfer initiated',
      description: `Transferring ${transferForm.serverIds.length} server(s) to target node...`,
      color: 'success',
    })

    showTransferModal.value = false
    transferForm.targetNodeId = ''
    transferForm.serverIds = []

    await serverTable.refresh()
    await refreshNode()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initiate transfer'
    toast.add({
      title: 'Error',
      description: message,
      color: 'error',
    })
  } finally {
    actionLoading.value = null
  }
}

</script>

<template>
  <UPage>
    <UPageBody>
      <section class="space-y-6">
        <div v-if="pending" class="space-y-4">
          <USkeleton class="h-8 w-3/4" />
          <USkeleton class="h-32" />
          <div class="grid gap-4 lg:grid-cols-3">
            <USkeleton class="h-40" repeat="3" />
          </div>
        </div>
        <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
          <template #title>Unable to load node details</template>
          <template #description>{{ (error as Error).message }}</template>
        </UAlert>
        <template v-else>
          <header class="flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-1">
              <p class="text-xs text-muted-foreground">Node {{ nodeId }}</p>
              <h1 class="text-xl font-semibold">{{ node?.name ?? 'Unknown node' }}</h1>
              <p class="text-xs text-muted-foreground">
                {{ node?.fqdn }} · {{ node?.scheme?.toUpperCase() === 'HTTPS' ? 'TLS' : 'HTTP' }} endpoint
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="statusBadge.color" size="xs">{{ statusBadge.label }}</UBadge>
              <UButton
                v-for="action in maintenanceActions"
                :key="action.label"
                :icon="action.icon"
                :loading="actionLoading === action.action"
                :disabled="actionLoading !== null"
                color="neutral"
                variant="ghost"
                @click="handleMaintenanceAction(action.action)"
              >
                {{ action.label }}
              </UButton>
            </div>
          </header>

          <UTabs v-model="tab" variant="link" :items="[
            { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
            { label: 'Servers', value: 'servers', icon: 'i-lucide-server' },
            { label: 'Allocations', value: 'allocations', icon: 'i-lucide-network' },
            { label: 'Settings', value: 'settings', icon: 'i-lucide-settings' },
            { label: 'Configuration', value: 'configuration', icon: 'i-lucide-file-code' },
            { label: 'System', value: 'system', icon: 'i-lucide-activity' },
          ]" class="w-full" />

          <div v-if="tab === 'overview'" class="grid gap-4 lg:grid-cols-3">
            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <h2 class="text-lg font-semibold">Status</h2>
              </template>
              <div class="space-y-3">
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Servers</span>
                  <span>{{ stats?.serversTotal ?? 0 }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Allocations</span>
                  <span>{{ stats?.allocationsTotal ?? 0 }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Memory usage</span>
                  <span>{{ formatUsage(resourceUsage.memory.used, resourceUsage.memory.total) }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Disk usage</span>
                  <span>{{ formatUsage(resourceUsage.disk.used, resourceUsage.disk.total) }}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Last seen</span>
                  <span>{{ lastSeenDisplay }}</span>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <h2 class="text-lg font-semibold">System snapshot</h2>
              </template>
              <div class="space-y-3">
                <UAlert v-if="systemError" color="warning" icon="i-lucide-alert-triangle" size="sm">
                  <template #title>Unable to contact Wings node</template>
                  <template #description>{{ systemError }}</template>
                </UAlert>
                <div v-else-if="systemMetrics.length === 0" class="text-xs text-muted-foreground">
                  No system data was returned.
                </div>
                <ul v-else class="space-y-2">
                  <li v-for="metric in systemMetrics" :key="metric.label"
                    class="flex items-center justify-between text-sm text-muted-foreground">
                    <span class="font-medium text-foreground">{{ metric.label }}</span>
                    <span>{{ metric.value }}</span>
                  </li>
                </ul>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <h2 class="text-lg font-semibold">Recent servers</h2>
              </template>
              <div v-if="recentServers.length === 0" class="text-sm text-muted-foreground">
                No servers were found for this node yet.
              </div>
              <ul v-else class="space-y-3">
                <li v-for="server in recentServers" :key="server.id" class="rounded-md border border-default px-4 py-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-semibold">{{ server.name }}</p>
                      <p class="text-xs text-muted-foreground">{{ server.identifier }}</p>
                    </div>
                    <UBadge :color="server.primaryAllocation ? 'primary' : 'neutral'" size="xs">
                      {{ server.primaryAllocation ? `${server.primaryAllocation.ip}:${server.primaryAllocation.port}` : 'No primary allocation' }}
                    </UBadge>
                  </div>
                </li>
              </ul>
            </UCard>
          </div>

          <UCard v-else-if="tab === 'servers'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">Servers</h2>
                <div class="flex flex-wrap items-center gap-2">
                  <UInput v-model="serverQuery.search" icon="i-lucide-search" placeholder="Search name or identifier"
                    size="sm" />
                  <USelect v-model="serverQuery.perPage" :options="[
                    { label: '25 / page', value: 25 },
                    { label: '50 / page', value: 50 },
                    { label: '100 / page', value: 100 },
                  ]" size="sm" />
                </div>
              </div>
            </template>
            <div class="overflow-hidden rounded-md border border-default">
              <table class="min-w-full divide-y divide-default text-sm">
                <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 text-left">Name</th>
                    <th class="px-3 py-2 text-left">Identifier</th>
                    <th class="px-3 py-2 text-left">Primary allocation</th>
                    <th class="px-3 py-2 text-left">Created</th>
                    <th class="px-3 py-2 text-left">Updated</th>
                    <th class="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="serverTable.pending.value" class="text-center text-sm text-muted-foreground">
                    <td colspan="6" class="px-3 py-6">Loading servers…</td>
                  </tr>
                  <tr v-else-if="serverRows.length === 0" class="text-center text-sm text-muted-foreground">
                    <td colspan="6" class="px-3 py-6">No servers found.</td>
                  </tr>
                  <tr v-for="server in serverRows" :key="server.id"
                    class="border-b border-default text-sm even:bg-muted/20">
                    <td class="px-3 py-2">
                      <div class="flex flex-col">
                        <span class="font-medium">{{ server.name }}</span>
                        <span class="text-xs text-muted-foreground">{{ server.uuid }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      <code>{{ server.identifier }}</code>
                    </td>
                    <td class="px-3 py-2">
                      <span v-if="server.primaryAllocation">{{ server.primaryAllocation.ip }}:{{
                        server.primaryAllocation.port
                        }}</span>
                      <span v-else class="text-muted-foreground">N/A</span>
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">{{ formatDateTime(server.createdAt) }}</td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">{{ formatDateTime(server.updatedAt) }}</td>
                    <td class="px-3 py-2 text-right">
                      <UDropdownMenu :items="[
                        {
                          label: 'View details',
                          icon: 'i-lucide-external-link',
                          click: () => handleViewServer(server),
                        },
                        {
                          label: 'Unlink from node',
                          icon: 'i-lucide-unlink',
                          color: 'warning',
                          click: () => handleUnlinkServer(server),
                        },
                      ]">
                        <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
                      </UDropdownMenu>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UPagination v-if="serverPagination" v-model:page="serverQuery.page"
              :page-count="Math.ceil(serverPagination.total / serverPagination.perPage)" :total="serverPagination.total"
              size="sm" />
          </UCard>

          <UCard v-else-if="tab === 'allocations'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">Allocations</h2>
                <div class="flex flex-wrap items-center gap-2">
                  <UInput v-model="allocationQuery.search" icon="i-lucide-search" placeholder="Filter by IP or port"
                    size="sm" />
                  <USelect v-model="allocationQuery.perPage" :options="[
                    { label: '25 / page', value: 25 },
                    { label: '50 / page', value: 50 },
                    { label: '100 / page', value: 100 },
                  ]" size="sm" />
                </div>
              </div>
            </template>
            <div class="overflow-hidden rounded-md border border-default">
              <table class="min-w-full divide-y divide-default text-sm">
                <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 text-left">IP</th>
                    <th class="px-3 py-2 text-left">Port</th>
                    <th class="px-3 py-2 text-left">Primary</th>
                    <th class="px-3 py-2 text-left">Server</th>
                    <th class="px-3 py-2 text-left">Identifier</th>
                    <th class="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="allocationTable.pending.value" class="text-center text-sm text-muted-foreground">
                    <td colspan="6" class="px-3 py-6">Loading allocations…</td>
                  </tr>
                  <tr v-else-if="allocationRows.length === 0" class="text-center text-sm text-muted-foreground">
                    <td colspan="6" class="px-3 py-6">No allocations found.</td>
                  </tr>
                  <tr v-for="allocation in allocationRows" :key="allocation.id"
                    class="border-b border-default text-sm even:bg-muted/20">
                    <td class="px-3 py-2 font-mono text-xs">{{ allocation.ip }}</td>
                    <td class="px-3 py-2 font-mono text-xs">{{ allocation.port }}</td>
                    <td class="px-3 py-2">
                      <UBadge :color="allocation.isPrimary ? 'primary' : 'neutral'" size="xs">
                        {{ allocation.isPrimary ? 'Primary' : 'Secondary' }}
                      </UBadge>
                    </td>
                    <td class="px-3 py-2">{{ allocation.serverName || 'N/A' }}</td>
                    <td class="px-3 py-2 font-mono text-xs">{{ allocation.serverIdentifier || '—' }}</td>
                    <td class="px-3 py-2 text-right">
                      <UDropdownMenu :items="[
                        {
                          label: allocation.isPrimary ? 'Mark as secondary' : 'Mark as primary',
                          icon: 'i-lucide-badge-check',
                          click: () => togglePrimaryAllocation(allocation),
                        },
                        {
                          label: 'Transfer to another node',
                          icon: 'i-lucide-send-horizontal',
                          click: () => handleTransferAllocation(allocation),
                        },
                        {
                          label: 'Delete allocation',
                          icon: 'i-lucide-trash-2',
                          color: 'error',
                          click: () => handleDeleteAllocation(allocation),
                        },
                      ]">
                        <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
                      </UDropdownMenu>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UPagination v-if="allocationPagination" v-model:page="allocationQuery.page"
              :page-count="Math.ceil(allocationPagination.total / allocationPagination.perPage)"
              :total="allocationPagination.total" size="sm" />
          </UCard>

          <UCard v-else-if="tab === 'settings'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <h2 class="text-lg font-semibold">Node Settings</h2>
            </template>
            <AdminNodeSettings v-if="node" :node="node" />
          </UCard>

          <UCard v-else-if="tab === 'configuration'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <h2 class="text-lg font-semibold">Auto-Deploy Configuration</h2>
            </template>
            <AdminNodeConfiguration v-if="node" :node-id="node.id" />
          </UCard>

          <UCard v-else-if="tab === 'system'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <h2 class="text-lg font-semibold">System Information</h2>
            </template>
            <AdminNodeSystem v-if="node" :node-id="node.id" />
          </UCard>
        </template>
      </section>
    </UPageBody>

    <UModal
      v-model:open="showTransferModal"
      title="Transfer Servers"
      description="Select servers to transfer to another node"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert icon="i-lucide-info">
            <template #title>Server Transfer</template>
            <template #description>
              Select servers from this node to transfer to another node. This action will move the servers and their allocations.
            </template>
          </UAlert>
          <UFormField label="Target Node" name="targetNodeId" required>
            <USelect
              v-model="transferForm.targetNodeId"
              :options="nodeOptions"
              placeholder="Select target node"
              searchable
            />
            <template #help>
              Choose the node to transfer servers to
            </template>
          </UFormField>
          <UFormField label="Servers to Transfer" name="serverIds">
            <div class="space-y-2">
              <div v-for="server in serverRows" :key="server.id" class="flex items-center gap-2">
                <UCheckbox
                  :model-value="transferForm.serverIds.includes(server.id)"
                  @update:model-value="(value: boolean | 'indeterminate') => setTransferServerChecked(server.id, value)"
                />
                <label class="text-sm">{{ server.name }}</label>
              </div>
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showTransferModal = false">Cancel</UButton>
          <UButton
            color="primary"
            :disabled="!transferForm.targetNodeId || transferForm.serverIds.length === 0"
            @click="handleTransferServers"
          >
            Transfer Servers
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
