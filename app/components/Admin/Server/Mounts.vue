<script setup lang="ts">
import type { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { MountUI as Mount } from '#shared/types/ui'
import { attachMountSchema } from '#shared/schema/server/operations'

const props = defineProps<{
  serverId: string
}>()

const toast = useToast()
const showAttachModal = ref(false)
const isSubmitting = ref(false)

const {
  data: mountsResponse,
  pending: mountsPending,
  refresh,
  error: mountsError,
} = await useAsyncData(`server-mounts-${props.serverId}`, async () => {
  const url = `/api/admin/servers/${props.serverId}/mounts`
  // @ts-expect-error - Nuxt typed routes cause deep type
  return await $fetch(url) as { data: Mount[] }
})
const serverMounts = computed(() => mountsResponse.value?.data ?? [])

const {
  data: availableMountsResponse,
  pending: availablePending,
  error: availableError,
} = await useFetch('/api/admin/mounts', {
  key: 'admin-mounts-list',
  onResponseError({ response }) {
    console.error('Failed to load mounts', response._data)
  },
})
const availableMounts = computed(() => (availableMountsResponse.value as { data: Mount[] } | null)?.data ?? [])

const attachSchema = attachMountSchema

type AttachFormSchema = z.infer<typeof attachSchema>

const form = reactive<AttachFormSchema>({
  mountId: '',
})

async function handleAttach(event: FormSubmitEvent<AttachFormSchema>) {
  if (isSubmitting.value)
    return

  isSubmitting.value = true

  try {
    await $fetch<unknown>(`/api/admin/servers/${props.serverId}/mounts`, {
      method: 'POST',
      body: { mountId: event.data.mountId },
    })

    toast.add({
      title: 'Mount attached',
      description: 'Mount has been attached to the server',
      color: 'success',
    })

    showAttachModal.value = false
    form.mountId = ''
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

    <div v-if="mountsPending" class="space-y-3">
      <UCard v-for="i in 3" :key="`mount-skeleton-${i}`" class="space-y-2">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-3 w-2/3" />
      </UCard>
    </div>

    <UAlert v-else-if="mountsError" color="error" icon="i-lucide-alert-triangle">
      <template #title>Unable to load mounts</template>
      <template #description>{{ (mountsError as Error).message }}</template>
    </UAlert>

    <div v-else-if="serverMounts.length === 0" class="rounded-lg border border-default p-8 text-center">
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

        <UForm
          :schema="attachSchema"
          :state="form"
          class="space-y-4"
          :disabled="isSubmitting || availablePending"
          @submit="handleAttach"
        >
          <UFormField label="Select Mount" name="mountId" required>
            <USelect
              v-model="form.mountId"
              :items="availableMounts.map((m: Mount) => ({ label: m.name, value: m.id }))"
              value-key="value"
              placeholder="Choose a mount"
            />
            <template #help>
              Select a mount to attach to this server
            </template>
          </UFormField>

          <UAlert v-if="availableError" color="error" icon="i-lucide-alert-triangle">
            <template #title>Failed to load available mounts</template>
            <template #description>{{ (availableError as Error).message }}</template>
          </UAlert>
        </UForm>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" :disabled="isSubmitting" @click="showAttachModal = false">
              Cancel
            </UButton>
            <UButton type="submit" color="primary" variant="subtle" :loading="isSubmitting" :disabled="isSubmitting">
              Attach Mount
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
