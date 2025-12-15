<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { FetchError } from 'ofetch'
import type { Server, ServerLimits } from '#shared/types/server'
import { serverBuildFormSchema } from '#shared/schema/admin/server'

const props = defineProps<{
  server: Server
}>()

const toast = useToast()
const isSubmitting = ref(false)
const requestFetch = useRequestFetch()

const {
  data: limitsData,
  pending: limitsPending,
  refresh: refreshLimits,
} = await useAsyncData(
  `server-limits-${props.server.id}`,
  async () => {
    try {
      const result = await requestFetch(`/api/admin/servers/${props.server.id}/limits`) as unknown
      if (result && typeof result === 'object' && 'data' in result) {
        const payload = result as { data?: ServerLimits | null }
        return payload.data ?? null
      }
      console.warn('[Build Form] Unexpected limits response shape:', result)
      return null
    }
    catch (error) {
      console.error('Failed to load server limits', error)
      return null
    }
  },
  {
    default: () => null,
  },
)

const limits = computed(() => limitsData.value)

const schema = serverBuildFormSchema.extend({
  cpu: z.coerce.number().min(0, 'CPU limit cannot be negative'),
  memory: z.coerce.number().min(0, 'Memory limit cannot be negative'),
  swap: z.coerce.number().min(-1, 'Swap must be -1 or greater'),
  disk: z.coerce.number().min(0, 'Disk limit cannot be negative'),
  io: z.coerce.number().min(10, 'Block I/O must be at least 10').max(1000, 'Block I/O cannot exceed 1000'),
})

type FormSchema = z.infer<typeof schema>

function createFormState(payload: ServerLimits | null): FormSchema {
  return {
    cpu: Number(payload?.cpu ?? 0),
    threads: payload?.threads ?? null,
    memory: Number(payload?.memory ?? 0),
    swap: Number(payload?.swap ?? 0),
    disk: Number(payload?.disk ?? 0),
    io: Number(payload?.io ?? 500),
  }
}

const form = reactive<FormSchema>(createFormState(limits.value))

watch(limits, (value) => {
  if (value) {
    const newState = createFormState(value)
    console.log('[Build Form] Limits updated, refreshing form:', {
      old: { ...form },
      new: newState,
    })
    Object.assign(form, newState)
  } else {
    const defaultState = createFormState(null)
    Object.assign(form, defaultState)
  }
}, { immediate: true, deep: true })

function isFetchError(error: unknown): error is FetchError<unknown> {
  return typeof error === 'object' && error !== null && ('status' in error || 'statusText' in error || 'response' in error)
}

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value)
    return

  isSubmitting.value = true

  try {
    const payload = {
      cpu: event.data.cpu ?? 0,
      memory: event.data.memory ?? 0,
      swap: event.data.swap ?? 0,
      disk: event.data.disk ?? 0,
      io: event.data.io ?? 500,
      threads: event.data.threads ?? null,
    }

    console.log('[Build Form] Sending update:', { 
      serverId: props.server.id,
      serverUuid: props.server.uuid,
      payload,
      url: `/api/admin/servers/${props.server.id}/build`,
    })

    let response: unknown
    try {
      response = await requestFetch(`/api/admin/servers/${props.server.id}/build`, {
        method: 'patch',
        body: payload,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }) as unknown

      console.log('[Build Form] Update response:', response)
      console.log('[Build Form] Response type:', typeof response)
      console.log('[Build Form] Response keys:', response ? Object.keys(response) : 'null')
      
      if (typeof response === 'string' && response.includes('<!DOCTYPE html>')) {
        console.error('[Build Form] CRITICAL: Received HTML instead of JSON! Route not matching!')
        throw new Error('Route not found - received HTML instead of JSON. The API endpoint may not be registered. Please restart the dev server.')
      }
      
      const responseObj = response as { success?: boolean } | null
      if (!response || (typeof response === 'object' && responseObj && 'success' in responseObj && !responseObj.success)) {
        console.warn('[Build Form] Response does not indicate success:', response)
      }
    } catch (fetchError: unknown) {
      const error = fetchError instanceof Error ? fetchError : new Error(String(fetchError))
      const httpError = isFetchError(fetchError) ? fetchError : null

      console.error('[Build Form] Fetch error:', {
        error: fetchError,
        message: error?.message,
        status: httpError?.status,
        statusText: httpError?.statusText,
        data: (httpError as FetchError<{ message?: string }> | null)?.data,
        response: httpError?.response,
        responseText: typeof httpError?.data === 'string' ? httpError.data.slice(0, 200) : undefined,
      })
      
      if (typeof httpError?.data === 'string' && httpError.data.includes('<!DOCTYPE html>')) {
        toast.add({
          title: 'Route Error',
          description: 'The API endpoint is not registered. Please restart the dev server.',
          color: 'error',
        })
        throw new Error('API route not found - dev server may need restart')
      }
      
      throw fetchError
    }

    console.log('[Build Form] Refreshing limits from server...')
    await refreshLimits()
    console.log('[Build Form] Limits refreshed:', limitsData.value)

    toast.add({
      title: 'Build updated',
      description: 'Server resource limits have been saved and synced with Wings',
      color: 'success',
    })
  }
  catch (error) {
    console.error('[Build Form] Failed to update build configuration:', error)
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
  <UForm
    :schema="schema"
    :state="form"
    class="space-y-6"
    :disabled="isSubmitting"
    :validate-on="['input']"
    @submit="handleSubmit"
  >
    <UAlert icon="i-lucide-info" variant="subtle">
      <template #title>Resource Limits</template>
      <template #description>
        Configure CPU, memory, disk, and I/O limits for this server. Set to 0 for unlimited.
      </template>
    </UAlert>

    <div v-if="limitsPending" class="grid gap-4 md:grid-cols-2">
      <UCard v-for="i in 4" :key="`build-skeleton-${i}`" class="space-y-3">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-10 w-full" />
      </UCard>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2">
      <UFormField label="CPU Limit (%)" name="cpu" required>
        <UInput v-model.number="form.cpu" type="number" placeholder="100" class="w-full" />
        <template #help>
          Percentage of CPU (100 = 1 core, 200 = 2 cores). 0 = unlimited.
        </template>
      </UFormField>

      <UFormField label="CPU Threads" name="threads">
        <UInput v-model="form.threads" placeholder="Leave empty for all threads" class="w-full" />
        <template #help>
          Specific CPU threads to use (e.g., "0,1,2" or "0-3"). Leave empty to use all.
        </template>
      </UFormField>

      <UFormField label="Memory Limit (MB)" name="memory" required>
        <UInput v-model.number="form.memory" type="number" placeholder="2048" class="w-full" />
        <template #help>
          Maximum memory in megabytes. 0 = unlimited.
        </template>
      </UFormField>

      <UFormField label="Swap (MB)" name="swap" required>
        <UInput v-model.number="form.swap" type="number" placeholder="0" class="w-full" />
        <template #help>
          Swap memory in megabytes. -1 = unlimited, 0 = disabled.
        </template>
      </UFormField>

      <UFormField label="Disk Space (MB)" name="disk" required>
        <UInput v-model.number="form.disk" type="number" placeholder="10240" class="w-full" />
        <template #help>
          Maximum disk space in megabytes. 0 = unlimited.
        </template>
      </UFormField>

      <UFormField label="Block I/O Weight" name="io" required>
        <UInput v-model.number="form.io" type="number" min="10" max="1000" placeholder="500" class="w-full" />
        <template #help>
          I/O performance (10-1000). Higher = better performance.
        </template>
      </UFormField>
    </div>

    <div class="flex justify-end">
      <UButton type="submit" color="primary" variant="subtle" :loading="isSubmitting" :disabled="isSubmitting">
        Save Build Configuration
      </UButton>
    </div>
  </UForm>
</template>
