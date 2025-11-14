<script setup lang="ts">
import type { Server } from '#shared/types/server'
import type { StartupResponse } from '#shared/types/api-responses'

const props = defineProps<{
  server: Server
}>()

const toast = useToast()
const isSubmitting = ref(false)

const { data: startupData, refresh } = await useFetch<StartupResponse>(`/api/admin/servers/${props.server.id}/startup`, {
  key: `server-startup-${props.server.id}`,
})
const startup = computed(() => startupData.value?.data)

const form = reactive({
  startup: startup.value?.startup || '',
  dockerImage: startup.value?.dockerImage || '',
  environment: startup.value?.environment || {},
})

watch(startup, (newStartup) => {
  if (newStartup) {
    form.startup = newStartup.startup
    form.dockerImage = newStartup.dockerImage
    form.environment = { ...newStartup.environment }
  }
})

const environmentVars = computed(() => {
  return Object.entries(form.environment).map(([key, value]) => ({ key, value }))
})

function updateEnvVar(key: string, value: string) {
  form.environment[key] = value
}

function removeEnvVar(key: string) {
  const { [key]: _, ...rest } = form.environment
  form.environment = rest
}

const newEnvKey = ref('')
const newEnvValue = ref('')

function addEnvVar() {
  if (newEnvKey.value && newEnvValue.value) {
    form.environment[newEnvKey.value] = newEnvValue.value
    newEnvKey.value = ''
    newEnvValue.value = ''
  }
}

async function handleSubmit() {
  isSubmitting.value = true

  try {
    await $fetch(`/api/admin/servers/${props.server.id}/startup`, {
      method: 'PATCH',
      body: form,
    })

    toast.add({
      title: 'Startup updated',
      description: 'Server startup configuration has been saved',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update startup configuration',
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
      <template #title>Startup Configuration</template>
      <template #description>
        Configure the startup command and environment variables for this server.
      </template>
    </UAlert>

    <div class="space-y-4">
      <UFormField label="Startup Command" name="startup" required>
        <UTextarea v-model="form.startup" placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
          :disabled="isSubmitting" :rows="4" class="w-full" />
        <template #help>
          Use &#123;&#123;VARIABLE&#125;&#125; syntax for environment variables
        </template>
      </UFormField>

      <UFormField label="Docker Image" name="dockerImage" required>
        <UInput v-model="form.dockerImage" placeholder="ghcr.io/pterodactyl/yolks:java-21" :disabled="isSubmitting" class="w-full" />
        <template #help>
          The Docker image to use for this server
        </template>
      </UFormField>
    </div>

    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">Environment Variables</h3>
      </div>

      <div v-if="environmentVars.length === 0" class="rounded-lg border border-default p-8 text-center">
        <UIcon name="i-lucide-variable" class="mx-auto size-8 text-muted-foreground" />
        <p class="mt-2 text-sm text-muted-foreground">
          No environment variables defined
        </p>
      </div>

      <div v-else class="space-y-2">
        <div v-for="envVar in environmentVars" :key="envVar.key"
          class="flex items-center gap-2 rounded-lg border border-default p-3">
          <div class="flex-1 grid gap-2 md:grid-cols-2">
            <div>
              <p class="text-xs text-muted-foreground">Key</p>
              <code class="text-sm font-medium">{{ envVar.key }}</code>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Value</p>
              <UInput :model-value="envVar.value" size="sm" :disabled="isSubmitting" class="w-full"
                @update:model-value="updateEnvVar(envVar.key, $event)" />
            </div>
          </div>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :disabled="isSubmitting"
            @click="removeEnvVar(envVar.key)" />
        </div>
      </div>

      <div class="flex gap-2">
        <UInput v-model="newEnvKey" placeholder="VARIABLE_NAME" size="sm" class="flex-1" :disabled="isSubmitting" />
        <UInput v-model="newEnvValue" placeholder="value" size="sm" class="flex-1" :disabled="isSubmitting" />
        <UButton icon="i-lucide-plus" color="primary" variant="soft" size="sm"
          :disabled="isSubmitting || !newEnvKey || !newEnvValue" @click="addEnvVar">
          Add
        </UButton>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
        Save Startup Configuration
      </UButton>
    </div>
  </form>
</template>
