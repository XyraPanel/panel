<script setup lang="ts">
import type { StoredWingsNode } from '#shared/types/wings'

const props = defineProps<{
  node: StoredWingsNode
}>()

const toast = useToast()
const isSubmitting = ref(false)

const form = reactive({
  name: props.node.name,
  description: props.node.description || '',
  fqdn: props.node.fqdn,
  scheme: props.node.scheme,
  public: props.node.public,
  maintenanceMode: props.node.maintenanceMode,
  behindProxy: props.node.behindProxy,
  memory: props.node.memory,
  memoryOverallocate: props.node.memoryOverallocate,
  disk: props.node.disk,
  diskOverallocate: props.node.diskOverallocate,
  uploadSize: props.node.uploadSize,
  daemonListen: props.node.daemonListen,
  daemonSftp: props.node.daemonSftp,
  daemonBase: props.node.daemonBase,
})

const validationErrors = ref<Record<string, string>>({})

function validateForm(): boolean {
  validationErrors.value = {}

  if (!form.name || form.name.trim().length === 0) {
    validationErrors.value.name = 'Node name is required'
  } else if (form.name.length > 100) {
    validationErrors.value.name = 'Node name must be 100 characters or less'
  }

  if (!form.fqdn || form.fqdn.trim().length === 0) {
    validationErrors.value.fqdn = 'FQDN is required'
  }

  if (!form.scheme || !['http', 'https'].includes(form.scheme)) {
    validationErrors.value.scheme = 'Valid scheme (http/https) is required'
  }

  if (form.memory <= 0) {
    validationErrors.value.memory = 'Memory must be greater than 0'
  }

  if (form.disk <= 0) {
    validationErrors.value.disk = 'Disk must be greater than 0'
  }

  if (form.daemonListen < 1 || form.daemonListen > 65535) {
    validationErrors.value.daemonListen = 'Daemon port must be between 1 and 65535'
  }

  if (form.daemonSftp < 1 || form.daemonSftp > 65535) {
    validationErrors.value.daemonSftp = 'SFTP port must be between 1 and 65535'
  }

  if (!form.daemonBase || form.daemonBase.trim().length === 0) {
    validationErrors.value.daemonBase = 'Daemon base directory is required'
  } else if (!form.daemonBase.startsWith('/')) {
    validationErrors.value.daemonBase = 'Daemon base directory must be an absolute path'
  }

  return Object.keys(validationErrors.value).length === 0
}

async function handleSubmit() {
  if (!validateForm()) {
    toast.add({
      title: 'Validation error',
      description: 'Please fix the errors in the form before submitting',
      color: 'error',
    })
    return
  }

  isSubmitting.value = true
  validationErrors.value = {}

  try {
    await $fetch(`/api/admin/wings/nodes/${props.node.id}`, {
      method: 'PATCH',
      body: form,
    })

    toast.add({
      title: 'Node updated',
      description: 'Node settings have been saved successfully',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string; errors?: Record<string, string[]> } }
    
    if (err.data?.errors) {
      validationErrors.value = Object.fromEntries(
        Object.entries(err.data.errors).map(([key, values]) => [key, values[0] || ''])
      )
    }

    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update node settings',
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

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Basic Information</h3>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Node Name" name="name" required :error="validationErrors.name">
          <UInput v-model="form.name" placeholder="Production Node 1" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="FQDN" name="fqdn" required :error="validationErrors.fqdn">
          <UInput v-model="form.fqdn" placeholder="node1.example.com" :disabled="isSubmitting" />
        </UFormField>
      </div>

      <UFormField label="Description" name="description">
        <UTextarea v-model="form.description" placeholder="Optional description" :disabled="isSubmitting" :rows="3" />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Scheme" name="scheme" required :error="validationErrors.scheme">
          <USelect v-model="form.scheme" :items="[
            { label: 'HTTP', value: 'http' },
            { label: 'HTTPS', value: 'https' },
          ]" value-key="value" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Upload Size Limit (MB)" name="uploadSize" :error="validationErrors.uploadSize">
          <UInput v-model.number="form.uploadSize" type="number" placeholder="100" min="1" max="1024" :disabled="isSubmitting" />
          <template #help>
            Maximum file upload size in megabytes (1-1024 MB)
          </template>
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Node Flags</h3>

      <div class="space-y-3">
        <UFormField label="Public Node" name="public">
          <div class="flex items-center justify-between rounded-lg border border-default p-4">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">Public Node</div>
              <div class="text-xs text-muted-foreground">
                Allow automatic server deployment to this node
              </div>
            </div>
            <UToggle v-model="form.public" :disabled="isSubmitting" />
          </div>
        </UFormField>

        <UFormField label="Maintenance Mode" name="maintenanceMode">
          <div class="flex items-center justify-between rounded-lg border border-default p-4">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">Maintenance Mode</div>
              <div class="text-xs text-muted-foreground">
                Prevent new servers from being created on this node
              </div>
            </div>
            <UToggle v-model="form.maintenanceMode" :disabled="isSubmitting" />
          </div>
        </UFormField>

        <UFormField label="Behind Proxy" name="behindProxy">
          <div class="flex items-center justify-between rounded-lg border border-default p-4">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">Behind Proxy</div>
              <div class="text-xs text-muted-foreground">
                Node is behind a proxy (Cloudflare, nginx, etc.)
              </div>
            </div>
            <UToggle v-model="form.behindProxy" :disabled="isSubmitting" />
          </div>
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Resource Limits</h3>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Total Memory (MB)" name="memory" required :error="validationErrors.memory">
          <UInput v-model.number="form.memory" type="number" placeholder="8192" min="1" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Memory Overallocate (%)" name="memoryOverallocate" :error="validationErrors.memoryOverallocate">
          <UInput v-model.number="form.memoryOverallocate" type="number" placeholder="0" min="-1" :disabled="isSubmitting" />
          <template #help>
            Percentage to overallocate memory (-1 to allow unlimited, 0 = no overallocation)
          </template>
        </UFormField>

        <UFormField label="Total Disk (MB)" name="disk" required :error="validationErrors.disk">
          <UInput v-model.number="form.disk" type="number" placeholder="102400" min="1" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Disk Overallocate (%)" name="diskOverallocate" :error="validationErrors.diskOverallocate">
          <UInput v-model.number="form.diskOverallocate" type="number" placeholder="0" min="-1" :disabled="isSubmitting" />
          <template #help>
            Percentage to overallocate disk (-1 to allow unlimited, 0 = no overallocation)
          </template>
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Daemon Configuration</h3>

      <div class="grid gap-4 md:grid-cols-3">
        <UFormField label="Daemon Port" name="daemonListen" required :error="validationErrors.daemonListen">
          <UInput v-model.number="form.daemonListen" type="number" placeholder="8080" min="1" max="65535" :disabled="isSubmitting" />
          <template #help>
            Port for Wings daemon API (1-65535)
          </template>
        </UFormField>

        <UFormField label="SFTP Port" name="daemonSftp" required :error="validationErrors.daemonSftp">
          <UInput v-model.number="form.daemonSftp" type="number" placeholder="2022" min="1" max="65535" :disabled="isSubmitting" />
          <template #help>
            Port for SFTP service (1-65535)
          </template>
        </UFormField>

        <UFormField label="Daemon Base Directory" name="daemonBase" required :error="validationErrors.daemonBase">
          <UInput v-model="form.daemonBase" placeholder="/var/lib/pterodactyl" :disabled="isSubmitting" />
          <template #help>
            Absolute path where server data is stored
          </template>
        </UFormField>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
        Save Changes
      </UButton>
    </div>
  </form>
</template>
