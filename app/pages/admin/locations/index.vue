<script setup lang="ts">
import type { LocationWithNodeCount, CreateLocationPayload } from '#shared/types/admin-locations'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const toast = useToast()

const { data: locationsData, pending, error, refresh } = await useAsyncData(
  'admin-locations',
  () => $fetch<{ data: LocationWithNodeCount[] }>('/api/admin/locations'),
)

const locations = computed(() => locationsData.value?.data ?? [])

const showCreateModal = ref(false)
const editingLocation = ref<LocationWithNodeCount | null>(null)
const isSubmitting = ref(false)

const form = ref<CreateLocationPayload>({
  short: '',
  long: '',
})

function resetForm() {
  form.value = {
    short: '',
    long: '',
  }
  editingLocation.value = null
}

function openCreateModal() {
  resetForm()
  showCreateModal.value = true
}

function openEditModal(location: LocationWithNodeCount) {
  editingLocation.value = location
  form.value = {
    short: location.short,
    long: location.long || '',
  }
  showCreateModal.value = true
}

async function handleSubmit() {
  if (!form.value.short) {
    toast.add({ title: 'Short code is required', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    if (editingLocation.value) {

      await $fetch(`/api/admin/locations/${editingLocation.value.id}`, {
        method: 'PATCH',
        body: form.value,
      })
      toast.add({ title: 'Location updated', color: 'success' })
    } else {

      await $fetch('/api/admin/locations', {
        method: 'POST',
        body: form.value,
      })
      toast.add({ title: 'Location created', color: 'success' })
    }

    showCreateModal.value = false
    resetForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: editingLocation.value ? 'Update failed' : 'Create failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(location: LocationWithNodeCount) {
  if (!confirm(`Delete location "${location.short}"? This cannot be undone.`)) {
    return
  }

  try {
    await $fetch(`/api/admin/locations/${location.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Location deleted', color: 'success' })
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
            <h1 class="text-xl font-semibold">Locations</h1>
            <p class="text-xs text-muted-foreground">Organize nodes by geographic location</p>
          </div>
          <div class="flex gap-2">
            <UButton icon="i-lucide-plus" color="primary" @click="openCreateModal">
              Create Location
            </UButton>
          </div>
        </header>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">All Locations</h2>
              <UBadge color="neutral">{{ locations.length }} total</UBadge>
            </div>
          </template>

          <div v-if="pending" class="space-y-2">
            <USkeleton v-for="i in 3" :key="i" class="h-16 w-full" />
          </div>

          <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
            <template #title>Failed to load locations</template>
            <template #description>{{ error.message }}</template>
          </UAlert>

          <div v-else-if="locations.length === 0" class="py-12 text-center">
            <UIcon name="i-lucide-map-pin" class="mx-auto size-12 text-muted-foreground opacity-50" />
            <p class="mt-4 text-sm text-muted-foreground">No locations yet</p>
            <UButton class="mt-4" size="sm" @click="openCreateModal">Create your first location</UButton>
          </div>

          <div v-else class="divide-y divide-default">
            <div v-for="location in locations" :key="location.id" class="flex items-center justify-between py-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-map-pin" class="size-4 text-primary" />
                  <span class="font-medium">{{ location.short }}</span>
                  <UBadge v-if="location.nodeCount > 0" size="xs" color="neutral">
                    {{ location.nodeCount }} node{{ location.nodeCount !== 1 ? 's' : '' }}
                  </UBadge>
                </div>
                <p v-if="location.long" class="mt-1 text-sm text-muted-foreground">
                  {{ location.long }}
                </p>
              </div>

              <div class="flex items-center gap-2">
                <UButton icon="i-lucide-pencil" size="xs" variant="ghost" @click="openEditModal(location)" />
                <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error"
                  :disabled="location.nodeCount > 0" @click="handleDelete(location)" />
              </div>
            </div>
          </div>
        </UCard>
      </section>
    </UPageBody>

    <UModal v-model:open="showCreateModal" :title="editingLocation ? 'Edit Location' : 'Create Location'"
      :description="editingLocation ? 'Update location details' : 'Add a new geographic location'">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField label="Short Code" name="short" required>
            <UInput v-model="form.short" placeholder="us-east" required :disabled="isSubmitting" class="w-full" />
            <template #help>
              Short identifier (e.g., "us-east", "eu-west")
            </template>
          </UFormField>

          <UFormField label="Description" name="long">
            <UInput v-model="form.long" placeholder="United States - East Coast" :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              Full location name or description
            </template>
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showCreateModal = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="isSubmitting" @click="handleSubmit">
            {{ editingLocation ? 'Update' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
