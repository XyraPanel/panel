<script setup lang="ts">
import type { LocationWithNodeCount, CreateLocationPayload } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const { t } = useI18n()
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
    toast.add({ title: t('admin.locations.shortCodeRequired'), color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    if (editingLocation.value) {

      await $fetch(`/api/admin/locations/${editingLocation.value.id}`, {
        method: 'patch',
        body: form.value,
      })
      toast.add({ title: t('admin.locations.locationUpdated'), color: 'success' })
    } else {

      await $fetch('/api/admin/locations', {
        method: 'POST',
        body: form.value,
      })
      toast.add({ title: t('admin.locations.locationCreated'), color: 'success' })
    }

    showCreateModal.value = false
    resetForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: editingLocation.value ? t('admin.locations.updateFailed') : t('admin.locations.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(location: LocationWithNodeCount) {
  if (!confirm(t('admin.locations.confirmDelete', { short: location.short }))) {
    return
  }

  try {
    await $fetch(`/api/admin/locations/${location.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: t('admin.locations.locationDeleted'), color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.locations.deleteFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    })
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('admin.locations.allLocations') }}</h2>
                <UButton icon="i-lucide-plus" color="primary" variant="subtle" @click="openCreateModal">
                  {{ t('admin.locations.createLocation') }}
                </UButton>
              </div>
            </template>

            <div v-if="pending" class="space-y-2">
              <USkeleton v-for="i in 3" :key="i" class="h-16 w-full" />
            </div>

            <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
              <template #title>{{ t('admin.locations.failedToLoadLocations') }}</template>
              <template #description>{{ error.message }}</template>
            </UAlert>

            <div v-else-if="locations.length === 0" class="py-12 text-center">
              <UIcon name="i-lucide-map-pin" class="mx-auto size-12 text-muted-foreground opacity-50" />
              <p class="mt-4 text-sm text-muted-foreground">{{ t('admin.locations.noLocationsYet') }}</p>
            </div>

            <div v-else class="divide-y divide-default">
              <div v-for="location in locations" :key="location.id" class="flex items-center justify-between py-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-map-pin" class="size-4 text-primary" />
                    <span class="font-medium">{{ location.short }}</span>
                    <UBadge v-if="location.nodeCount > 0" size="xs" color="neutral">
                      {{ location.nodeCount }} {{ location.nodeCount !== 1 ? t('admin.locations.nodes') : t('admin.locations.node') }}
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
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateModal" :title="editingLocation ? t('admin.locations.editLocation') : t('admin.locations.createLocation')"
      :description="editingLocation ? t('admin.locations.editLocationDescription') : t('admin.locations.createLocationDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="t('admin.locations.shortCode')" name="short" required>
            <UInput v-model="form.short" :placeholder="t('admin.locations.shortCodePlaceholder')" required :disabled="isSubmitting" class="w-full" />
            <template #help>
              {{ t('admin.locations.shortCodeHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.locations.longName')" name="long">
            <UInput v-model="form.long" :placeholder="t('admin.locations.longNamePlaceholder')" :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              {{ t('admin.locations.longNameHelp') }}
            </template>
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="error" :disabled="isSubmitting" @click="showCreateModal = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleSubmit">
            {{ editingLocation ? t('common.update') : t('common.create') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
