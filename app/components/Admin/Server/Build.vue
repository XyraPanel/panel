<script setup lang="ts">
import type { Server, ServerLimits } from '#shared/types/server'

const props = defineProps<{
  server: Server
}>()

const toast = useToast()
const isSubmitting = ref(false)

const { data: limitsData } = await useFetch<{ data: ServerLimits }>(`/api/admin/servers/${props.server.id}/limits`, {
  key: `server-limits-${props.server.id}`,
})
const limits = computed(() => limitsData.value?.data)

const form = reactive({
  cpu: limits.value?.cpu || 0,
  memory: limits.value?.memory || 0,
  swap: limits.value?.swap || 0,
  disk: limits.value?.disk || 0,
  io: limits.value?.io || 500,
  threads: limits.value?.threads || null,
})

watch(limits, (newLimits) => {
  if (newLimits) {
    Object.assign(form, newLimits)
  }
})

async function handleSubmit() {
  isSubmitting.value = true

  try {
    await $fetch(`/api/admin/servers/${props.server.id}/build`, {
      method: 'PATCH',
      body: form,
    })

    toast.add({
      title: 'Build updated',
      description: 'Server resource limits have been saved',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update build configuration',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <UAlert icon="i-lucide-info">
      <template #title>Resource Limits</template>
      <template #description>
        Configure CPU, memory, disk, and I/O limits for this server. Set to 0 for unlimited.
      </template>
    </UAlert>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="CPU Limit (%)" name="cpu" required>
        <UInput v-model.number="form.cpu" type="number" placeholder="100" :disabled="isSubmitting" class="w-full" />
        <template #help>
          Percentage of CPU (100 = 1 core, 200 = 2 cores). 0 = unlimited.
        </template>
      </UFormField>

      <UFormField label="CPU Threads" name="threads">
        <UInput v-model="form.threads" placeholder="Leave empty for all threads" :disabled="isSubmitting" class="w-full" />
        <template #help>
          Specific CPU threads to use (e.g., "0,1,2" or "0-3"). Leave empty to use all.
        </template>
      </UFormField>

      <UFormField label="Memory Limit (MB)" name="memory" required>
        <UInput v-model.number="form.memory" type="number" placeholder="2048" :disabled="isSubmitting" class="w-full" />
        <template #help>
          Maximum memory in megabytes. 0 = unlimited.
        </template>
      </UFormField>

      <UFormField label="Swap (MB)" name="swap" required>
        <UInput v-model.number="form.swap" type="number" placeholder="0" :disabled="isSubmitting" class="w-full" />
        <template #help>
          Swap memory in megabytes. -1 = unlimited, 0 = disabled.
        </template>
      </UFormField>

      <UFormField label="Disk Space (MB)" name="disk" required>
        <UInput v-model.number="form.disk" type="number" placeholder="10240" :disabled="isSubmitting" class="w-full" />
        <template #help>
          Maximum disk space in megabytes. 0 = unlimited.
        </template>
      </UFormField>

      <UFormField label="Block I/O Weight" name="io" required>
        <UInput v-model.number="form.io" type="number" min="10" max="1000" placeholder="500" :disabled="isSubmitting" class="w-full" />
        <template #help>
          I/O performance (10-1000). Higher = better performance.
        </template>
      </UFormField>
    </div>

    <div class="flex justify-end">
      <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
        Save Build Configuration
      </UButton>
    </div>
  </form>
</template>
