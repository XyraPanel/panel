<script setup lang="ts">
import type { MountWithRelations, CreateMountPayload } from '#shared/types/admin-mounts'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const toast = useToast()

const { data: mountsData, pending, error, refresh } = await useFetch('/api/admin/mounts', {
  key: 'admin-mounts',
})

const mounts = computed(() => mountsData.value?.data ?? [])

const requestFetch = useRequestFetch()

const { data: nodesData } = await useAsyncData('admin-mount-nodes', () =>
  requestFetch<{ data: { id: string; name: string }[] }>('/api/admin/wings/nodes'),
)

const { data: eggsData } = await useAsyncData('admin-mount-eggs', () =>
  requestFetch<{ data: { id: string; name: string; nestName?: string }[] }>('/api/admin/eggs'),
)

const nodeOptions = computed(() => (nodesData.value?.data ?? []).map(node => ({
  value: node.id,
  label: node.name,
})))

const eggOptions = computed(() => (eggsData.value?.data ?? []).map(egg => ({
  value: egg.id,
  label: egg.nestName ? `${egg.nestName} • ${egg.name}` : egg.name,
})))

const showCreateModal = ref(false)
const isSubmitting = ref(false)

const form = ref<CreateMountPayload>({
  name: '',
  description: '',
  source: '',
  target: '',
  readOnly: false,
  userMountable: false,
  eggs: [],
  nodes: [],
})

function resetForm() {
  form.value = {
    name: '',
    description: '',
    source: '',
    target: '',
    readOnly: false,
    userMountable: false,
    eggs: [],
    nodes: [],
  }
}

function openCreateModal() {
  resetForm()
  showCreateModal.value = true
}

async function handleSubmit() {
  if (!form.value.name || !form.value.source || !form.value.target) {
    toast.add({ title: 'Name, source, and target are required', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/admin/mounts', {
      method: 'POST',
      body: form.value,
    })
    toast.add({ title: 'Mount created', color: 'success' })
    showCreateModal.value = false
    resetForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Create failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(mount: MountWithRelations) {
  if (!confirm(`Delete mount "${mount.name}"? This cannot be undone.`)) {
    return
  }

  try {
    await $fetch(`/api/admin/mounts/${mount.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Mount deleted', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Delete failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-xl font-semibold">Mounts</h1>
            <p class="text-xs text-muted-foreground">Manage shared directories for servers</p>
          </div>
          <div class="flex gap-2">
            <UButton icon="i-lucide-plus" color="primary" @click="openCreateModal">
              Create Mount
            </UButton>
          </div>
        </header>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">All Mounts</h2>
              <UBadge color="neutral">{{ mounts.length }} total</UBadge>
            </div>
          </template>

          <div v-if="pending" class="space-y-2">
            <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
          </div>

          <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
            <template #title>Failed to load mounts</template>
            <template #description>{{ error.message }}</template>
          </UAlert>

          <div v-else-if="mounts.length === 0" class="py-12 text-center">
            <UIcon name="i-lucide-folder-tree" class="mx-auto size-12 text-muted-foreground opacity-50" />
            <p class="mt-4 text-sm text-muted-foreground">No mounts yet</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Mounts allow sharing directories between servers
            </p>
            <UButton class="mt-4" size="sm" @click="openCreateModal">Create your first mount</UButton>
          </div>

          <div v-else class="divide-y divide-default">
            <div v-for="mount in mounts" :key="mount.id" class="flex items-start justify-between py-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder-tree" class="size-4 text-primary" />
                  <span class="font-medium">{{ mount.name }}</span>
                  <UBadge v-if="mount.readOnly" size="xs" color="neutral">Read Only</UBadge>
                  <UBadge v-if="mount.userMountable" size="xs" color="primary">User Mountable</UBadge>
                </div>
                <p v-if="mount.description" class="mt-1 text-sm text-muted-foreground">
                  {{ mount.description }}
                </p>
                <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div class="flex items-center gap-2">
                    <span>Source:</span>
                    <code class="rounded bg-muted px-1 py-0.5">{{ mount.source }}</code>
                    <span>→</span>
                    <code class="rounded bg-muted px-1 py-0.5">{{ mount.target }}</code>
                  </div>
                  <div class="flex items-center gap-3">
                    <span>{{ mount.eggs.length }} egg(s)</span>
                    <span>{{ mount.nodes.length }} node(s)</span>
                    <span>{{ mount.servers.length }} server(s)</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error" @click="handleDelete(mount)" />
              </div>
            </div>
          </div>
        </UCard>
      </section>
    </UPageBody>

    <UModal v-model:open="showCreateModal" title="Create Mount" description="Create a shared directory mount">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField label="Name" name="name" required>
            <UInput v-model="form.name" placeholder="Shared Maps" required :disabled="isSubmitting" class="w-full" />
          </UFormField>

          <UFormField label="Description" name="description">
            <UTextarea v-model="form.description" placeholder="Shared game maps directory" :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField label="Source Path" name="source" required>
            <UInput v-model="form.source" placeholder="/mnt/shared/maps" required :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              Path on the host system
            </template>
          </UFormField>

          <UFormField label="Target Path" name="target" required>
            <UInput v-model="form.target" placeholder="/home/container/maps" required :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              Path inside the container
            </template>
          </UFormField>

          <div class="flex gap-4">
            <UFormField label="Read Only" name="readOnly">
              <UToggle v-model="form.readOnly" :disabled="isSubmitting" />
            </UFormField>

            <UFormField label="User Mountable" name="userMountable">
              <UToggle v-model="form.userMountable" :disabled="isSubmitting" />
              <template #help>
                Allow users to mount this
              </template>
            </UFormField>
          </div>

          <UFormField label="Nodes" name="nodes">
            <USelect
              v-model="form.nodes"
              :items="nodeOptions"
              multiple
              value-key="value"
              placeholder="Select nodes"
              :disabled="isSubmitting"
            />
          </UFormField>

          <UFormField label="Eggs" name="eggs">
            <USelect
              v-model="form.eggs"
              :items="eggOptions"
              multiple
              value-key="value"
              placeholder="Select eggs"
              :disabled="isSubmitting"
            />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showCreateModal = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="isSubmitting" @click="handleSubmit">
            Create Mount
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
