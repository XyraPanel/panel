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

async function handleSubmit() {
  isSubmitting.value = true

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
    const err = error as { data?: { message?: string } }
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
        <UFormField label="Node Name" name="name" required>
          <UInput v-model="form.name" placeholder="Production Node 1" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="FQDN" name="fqdn" required>
          <UInput v-model="form.fqdn" placeholder="node1.example.com" :disabled="isSubmitting" />
        </UFormField>
      </div>

      <UFormField label="Description" name="description">
        <UTextarea v-model="form.description" placeholder="Optional description" :disabled="isSubmitting" :rows="3" />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Scheme" name="scheme" required>
          <USelect v-model="form.scheme" :items="[
            { label: 'HTTP', value: 'http' },
            { label: 'HTTPS', value: 'https' },
          ]" value-key="value" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Upload Size Limit (MB)" name="uploadSize">
          <UInput v-model.number="form.uploadSize" type="number" placeholder="100" :disabled="isSubmitting" />
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
        <UFormField label="Total Memory (MB)" name="memory" required>
          <UInput v-model.number="form.memory" type="number" placeholder="8192" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Memory Overallocate (%)" name="memoryOverallocate">
          <UInput v-model.number="form.memoryOverallocate" type="number" placeholder="0" :disabled="isSubmitting" />
          <template #help>
            Percentage to overallocate memory (0 = no overallocation)
          </template>
        </UFormField>

        <UFormField label="Total Disk (MB)" name="disk" required>
          <UInput v-model.number="form.disk" type="number" placeholder="102400" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Disk Overallocate (%)" name="diskOverallocate">
          <UInput v-model.number="form.diskOverallocate" type="number" placeholder="0" :disabled="isSubmitting" />
          <template #help>
            Percentage to overallocate disk (0 = no overallocation)
          </template>
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Daemon Configuration</h3>

      <div class="grid gap-4 md:grid-cols-3">
        <UFormField label="Daemon Port" name="daemonListen" required>
          <UInput v-model.number="form.daemonListen" type="number" placeholder="8080" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="SFTP Port" name="daemonSftp" required>
          <UInput v-model.number="form.daemonSftp" type="number" placeholder="2022" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Daemon Base Directory" name="daemonBase" required>
          <UInput v-model="form.daemonBase" placeholder="/var/lib/pterodactyl" :disabled="isSubmitting" />
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
