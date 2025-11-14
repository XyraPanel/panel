<script setup lang="ts">
import type { Server } from '#shared/types/server'

const props = defineProps<{
  server: Server
}>()

const toast = useToast()
const router = useRouter()

async function handleSuspend() {
  if (!confirm(`Are you sure you want to ${props.server.suspended ? 'unsuspend' : 'suspend'} this server?`)) {
    return
  }

  try {
    const endpoint = props.server.suspended ? 'unsuspend' : 'suspend'
    await $fetch(`/api/admin/servers/${props.server.id}/${endpoint}`, {
      method: 'POST',
    })

    toast.add({
      title: props.server.suspended ? 'Server unsuspended' : 'Server suspended',
      description: `The server has been ${props.server.suspended ? 'unsuspended' : 'suspended'}`,
      color: 'success',
    })

    router.go(0)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update suspension status',
      color: 'error',
    })
  }
}

async function handleReinstall() {
  if (!confirm('Are you sure you want to reinstall this server? This will delete all server files!')) {
    return
  }

  try {
    await $fetch(`/api/admin/servers/${props.server.id}/reinstall`, {
      method: 'POST',
    })

    toast.add({
      title: 'Reinstall triggered',
      description: 'Server reinstallation has been queued',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to trigger reinstall',
      color: 'error',
    })
  }
}

const showTransferModal = ref(false)
const transferNodeId = ref('')
const transferAllocationId = ref('')
const transferAdditionalAllocations = ref('')
const transferStartOnCompletion = ref(true)

async function handleTransfer() {
  if (!transferNodeId.value) return

  try {
    await $fetch(`/api/admin/servers/${props.server.id}/transfer`, {
      method: 'POST',
      body: {
        nodeId: transferNodeId.value,
        allocationId: transferAllocationId.value || undefined,
        additionalAllocationIds: transferAdditionalAllocations.value,
        startOnCompletion: transferStartOnCompletion.value,
      },
    })

    toast.add({
      title: 'Transfer initiated',
      description: 'Server transfer has been started',
      color: 'success',
    })

    showTransferModal.value = false
    transferNodeId.value = ''
    transferAllocationId.value = ''
    transferAdditionalAllocations.value = ''
    transferStartOnCompletion.value = true
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to initiate transfer',
      color: 'error',
    })
  }
}

async function handleDelete() {
  if (!confirm('Are you sure you want to DELETE this server? This action CANNOT be undone!')) {
    return
  }

  if (!confirm('This will permanently delete all server data. Type the server name to confirm.')) {
    return
  }

  try {
    await $fetch(`/api/admin/servers/${props.server.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Server deleted',
      description: 'The server has been permanently deleted',
      color: 'success',
    })

    router.push('/admin/servers')
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to delete server',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert icon="i-lucide-alert-triangle" color="warning">
      <template #title>Danger Zone</template>
      <template #description>
        These actions can have significant impact on the server. Use with caution.
      </template>
    </UAlert>

    <div class="space-y-3">

      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">{{ server.suspended ? 'Unsuspend Server' : 'Suspend Server' }}</p>
          <p class="text-sm text-muted-foreground">
            {{ server.suspended ? 'Allow the server to start and be accessed' : 'Prevent the server from starting and block access' }}
          </p>
        </div>
        <UButton
          :icon="server.suspended ? 'i-lucide-play' : 'i-lucide-pause'"
          :color="server.suspended ? 'primary' : 'warning'"
          @click="handleSuspend"
        >
          {{ server.suspended ? 'Unsuspend' : 'Suspend' }}
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">Reinstall Server</p>
          <p class="text-sm text-muted-foreground">
            Delete all server files and run the installation script again
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="warning"
          @click="handleReinstall"
        >
          Reinstall
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">Transfer Server</p>
          <p class="text-sm text-muted-foreground">
            Move this server to a different node
          </p>
        </div>
        <UButton
          icon="i-lucide-truck"
          color="primary"
          variant="soft"
          @click="showTransferModal = true"
        >
          Transfer
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-error p-4">
        <div class="space-y-1">
          <p class="font-medium text-error">Delete Server</p>
          <p class="text-sm text-muted-foreground">
            Permanently delete this server and all its data
          </p>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          @click="handleDelete"
        >
          Delete
        </UButton>
      </div>
    </div>

    <UModal v-model:open="showTransferModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Transfer Server</h3>
        </template>

        <form class="space-y-4" @submit.prevent="handleTransfer">
          <UAlert icon="i-lucide-info">
            <template #title>Server Transfer</template>
            <template #description>
              The server will be stopped, transferred to the new node, and started automatically.
            </template>
          </UAlert>

          <UFormField label="Target Node" name="nodeId" required>
            <UInput
              v-model="transferNodeId"
              placeholder="node-id"
              class="w-full"
            />
            <template #help>
              Enter the ID of the node to transfer to
            </template>
          </UFormField>

          <UFormField label="Primary Allocation" name="allocationId">
            <UInput
              v-model="transferAllocationId"
              placeholder="allocation-id (optional)"
              class="w-full"
            />
            <template #help>
              Leave blank to automatically choose a free allocation on the target node.
            </template>
          </UFormField>

          <UFormField label="Additional Allocations" name="additionalAllocations">
            <UInput
              v-model="transferAdditionalAllocations"
              placeholder="allocation-id-1, allocation-id-2"
              class="w-full"
            />
            <template #help>
              Provide comma-separated allocation IDs to assign after transfer.
            </template>
          </UFormField>

          <UFormField label="Start server after transfer" name="startOnCompletion">
            <div class="flex items-center gap-2">
              <input
                id="start-on-completion"
                v-model="transferStartOnCompletion"
                type="checkbox"
                class="h-4 w-4 rounded border-default"
              >
              <label for="start-on-completion" class="text-sm text-muted-foreground">Automatically start the server once the transfer finishes.</label>
            </div>
          </UFormField>
        </form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="showTransferModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :disabled="!transferNodeId"
              @click="handleTransfer"
            >
              Start Transfer
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
