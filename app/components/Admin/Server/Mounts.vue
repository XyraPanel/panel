<script setup lang="ts">
import type { Mount } from '#shared/types/ui'

const props = defineProps<{
  serverId: string
}>()

const toast = useToast()
const showAttachModal = ref(false)
const isSubmitting = ref(false)

const { data: mountsData, refresh } = await useFetch<{ data: Mount[] }>(`/api/admin/servers/${props.serverId}/mounts`, {
  key: `server-mounts-${props.serverId}`,
})
const serverMounts = computed(() => mountsData.value?.data || [])

const { data: availableMountsData } = await useFetch('/api/admin/mounts', {
  key: 'admin-mounts-list',
})
const availableMounts = computed(() => availableMountsData.value?.data || [])

const selectedMountId = ref('')

async function handleAttach() {
  if (!selectedMountId.value) return

  isSubmitting.value = true

  try {
    await $fetch<unknown>(`/api/admin/servers/${props.serverId}/mounts`, {
      method: 'POST',
      body: { mountId: selectedMountId.value },
    })

    toast.add({
      title: 'Mount attached',
      description: 'Mount has been attached to the server',
      color: 'success',
    })

    showAttachModal.value = false
    selectedMountId.value = ''
    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to attach mount',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function handleDetach(mountId: string, mountName: string) {
  if (!confirm(`Are you sure you want to detach the mount "${mountName}"?`)) {
    return
  }

  try {
    await $fetch(`/api/admin/servers/${props.serverId}/mounts/${mountId}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Mount detached',
      description: 'Mount has been removed from the server',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to detach mount',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted-foreground">
        Manage shared directory mounts for this server
      </p>
      <UButton icon="i-lucide-plus" color="primary" @click="showAttachModal = true">
        Attach Mount
      </UButton>
    </div>

    <div v-if="serverMounts.length === 0" class="rounded-lg border border-default p-8 text-center">
      <UIcon name="i-lucide-folder-tree" class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-2 text-sm text-muted-foreground">
        No mounts attached to this server
      </p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="mount in serverMounts" :key="mount.id"
        class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="flex-1 space-y-1">
          <p class="font-medium">{{ mount.name }}</p>
          <div class="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Source: <code>{{ mount.source }}</code></span>
            <span>Target: <code>{{ mount.target }}</code></span>
            <UBadge v-if="mount.readOnly" size="xs" color="warning">Read Only</UBadge>
          </div>
        </div>

        <UButton icon="i-lucide-unlink" color="error" variant="ghost" size="sm"
          @click="handleDetach(mount.id, mount.name)">
          Detach
        </UButton>
      </div>
    </div>

    <UModal v-model:open="showAttachModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Attach Mount</h3>
        </template>

        <form class="space-y-4" @submit.prevent="handleAttach">
          <UFormField label="Select Mount" name="mountId" required>
            <USelect v-model="selectedMountId" :items="availableMounts.map((m: any) => ({ label: m.name, value: m.id }))"
              value-key="value" placeholder="Choose a mount" :disabled="isSubmitting" />
            <template #help>
              Select a mount to attach to this server
            </template>
          </UFormField>
        </form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" :disabled="isSubmitting" @click="showAttachModal = false">
              Cancel
            </UButton>
            <UButton color="primary" :loading="isSubmitting" :disabled="!selectedMountId" @click="handleAttach">
              Attach Mount
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
