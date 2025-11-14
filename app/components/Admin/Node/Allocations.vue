<script setup lang="ts">
import type { Allocation } from '#shared/types/allocation'

const props = defineProps<{
  nodeId: string
}>()

const toast = useToast()
const page = ref(1)
const pageSize = ref(50)
const filter = ref<'all' | 'assigned' | 'unassigned'>('all')

const { data: allocationsData, pending, refresh } = await useFetch<{ data: Allocation[] }>(
  `/api/admin/nodes/${props.nodeId}/allocations`,
  { key: `node-allocations-${props.nodeId}` },
)

const allocations = computed(() => allocationsData.value?.data || [])

const filteredAllocations = computed(() => {
  if (filter.value === 'assigned') {
    return allocations.value.filter((a: Allocation) => a.serverId !== null)
  }
  if (filter.value === 'unassigned') {
    return allocations.value.filter((a: Allocation) => a.serverId === null)
  }
  return allocations.value
})

const paginatedAllocations = computed(() => {
  const start = (page.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredAllocations.value.slice(start, end)
})

const _totalPages = computed(() => Math.ceil(filteredAllocations.value.length / pageSize.value))

const showCreateModal = ref(false)
const createForm = reactive({
  ip: '',
  ports: '',
  ipAlias: '',
})

async function createAllocations() {
  try {

    const ports: number[] = []
    const portsInput = createForm.ports.trim()

    if (portsInput.includes('-')) {

      const parts = portsInput.split('-')
      const start = Number(parts[0])
      const end = Number(parts[1])
      if (isNaN(start) || isNaN(end) || start >= end) {
        throw new Error('Invalid port range')
      }
      for (let port = start; port <= end; port++) {
        ports.push(port)
      }
    } else if (portsInput.includes(',')) {

      const portList = portsInput.split(',').map(p => Number(p.trim()))
      if (portList.some(isNaN)) {
        throw new Error('Invalid port list')
      }
      ports.push(...portList)
    } else {

      const port = Number(portsInput)
      if (isNaN(port)) {
        throw new Error('Invalid port')
      }
      ports.push(port)
    }

    await $fetch(`/api/admin/nodes/${props.nodeId}/allocations`, {
      method: 'POST',
      body: {
        ip: createForm.ip,
        ports,
        ipAlias: createForm.ipAlias || undefined,
      },
    })

    toast.add({
      title: 'Allocations created',
      description: `Created ${ports.length} allocations`,
      color: 'success',
    })

    showCreateModal.value = false
    createForm.ip = ''
    createForm.ports = ''
    createForm.ipAlias = ''
    await refresh()
  } catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to create allocations',
      color: 'error',
    })
  }
}

const updatingAlias = ref<string | null>(null)

async function updateAlias(allocation: Allocation, newAlias: string) {
  updatingAlias.value = allocation.id
  try {
    await $fetch(`/api/admin/allocations/${allocation.id}`, {
      method: 'PATCH',
      body: { ipAlias: newAlias || null },
    })

    toast.add({
      title: 'Alias updated',
      color: 'success',
    })

    await refresh()
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to update alias',
      color: 'error',
    })
  } finally {
    updatingAlias.value = null
  }
}

async function deleteAllocation(allocation: Allocation) {
  if (!confirm(`Delete allocation ${allocation.ip}:${allocation.port}?`)) {
    return
  }

  try {
    await $fetch(`/api/admin/allocations/${allocation.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Allocation deleted',
      color: 'success',
    })

    await refresh()
  } catch (err) {
    const error = err as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to delete allocation',
      color: 'error',
    })
  }
}

const columns: Array<{ key: string, label: string }> = [
  { key: 'ip', label: 'IP Address' },
  { key: 'ipAlias', label: 'IP Alias' },
  { key: 'port', label: 'Port' },
  { key: 'server', label: 'Assigned To' },
  { key: 'actions', label: '' },
]
</script>

<template>
  <div class="space-y-4">

    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex gap-2">
        <UButton :color="filter === 'all' ? 'primary' : 'neutral'" variant="soft" @click="filter = 'all'">
          All ({{ allocations.length }})
        </UButton>
        <UButton :color="filter === 'assigned' ? 'primary' : 'neutral'" variant="soft" @click="filter = 'assigned'">
          Assigned ({{allocations.filter((a: Allocation) => a.serverId).length}})
        </UButton>
        <UButton :color="filter === 'unassigned' ? 'primary' : 'neutral'" variant="soft" @click="filter = 'unassigned'">
          Unassigned ({{allocations.filter((a: Allocation) => !a.serverId).length}})
        </UButton>
      </div>

      <UButton icon="i-lucide-plus" color="primary" @click="showCreateModal = true">
        Create Allocations
      </UButton>
    </div>

    <UCard>
      <UTable :rows="paginatedAllocations as Allocation[]" :columns="columns as any" :loading="pending">
        <template #ip-data="{ row }">
          <code class="text-sm">{{ (row as unknown as Allocation).ip }}</code>
        </template>

        <template #ipAlias-data="{ row }">
          <UInput :model-value="(row as unknown as Allocation).ipAlias || ''" placeholder="none" size="sm"
            :loading="updatingAlias === (row as unknown as Allocation).id"
            @blur="updateAlias(row as unknown as Allocation, ($event.target as HTMLInputElement).value)" />
        </template>

        <template #port-data="{ row }">
          <code class="text-sm">{{ (row as unknown as Allocation).port }}</code>
        </template>

        <template #server-data="{ row }">
          <NuxtLink v-if="(row as unknown as Allocation).serverId"
            :to="`/admin/servers/${(row as unknown as Allocation).serverId}`" class="text-primary hover:underline">
            Server
          </NuxtLink>
          <span v-else class="text-sm text-muted-foreground">-</span>
        </template>

        <template #actions-data="{ row }">
          <UButton v-if="!(row as unknown as Allocation).serverId" icon="i-lucide-trash-2" color="error" variant="ghost"
            size="sm" @click="deleteAllocation(row as unknown as Allocation)" />
        </template>
      </UTable>

      <template #footer>
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            Showing {{ (page - 1) * pageSize + 1 }} to {{ Math.min(page * pageSize, filteredAllocations.length) }} of {{
              filteredAllocations.length }}
          </div>
          <UPagination v-model="page" :total="filteredAllocations.length" :page-size="pageSize" />
        </div>
      </template>
    </UCard>

    <UModal v-model="showCreateModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Create Allocations</h3>
        </template>

        <form class="space-y-4" @submit.prevent="createAllocations">
          <UAlert icon="i-lucide-info">
            <template #title>Bulk Creation</template>
            <template #description>
              You can create multiple allocations at once by specifying a port range (e.g., 25565-25665) or
              comma-separated ports (e.g., 25565,25566,25567).
            </template>
          </UAlert>

          <UFormField label="IP Address" name="ip" required>
            <UInput v-model="createForm.ip" placeholder="0.0.0.0" />
            <template #help>
              The IP address to bind allocations to
            </template>
          </UFormField>

          <UFormField label="Ports" name="ports" required>
            <UInput v-model="createForm.ports" placeholder="25565-25665 or 25565,25566,25567" />
            <template #help>
              Port range (25565-25665) or comma-separated list (25565,25566,25567)
            </template>
          </UFormField>

          <UFormField label="IP Alias" name="ipAlias">
            <UInput v-model="createForm.ipAlias" placeholder="play.example.com" />
            <template #help>
              Optional DNS alias for this IP address
            </template>
          </UFormField>
        </form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showCreateModal = false">
              Cancel
            </UButton>
            <UButton color="primary" @click="createAllocations">
              Create Allocations
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
