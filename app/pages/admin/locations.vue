<script setup lang="ts">
import type { LocationWithNodeCount, CreateLocationPayload } from '#shared/types/admin';

definePageMeta({
  auth: true,
  adminTitle: 'admin.locations.title',
  adminSubtitle: 'admin.locations.subtitle',
});

const { t } = useI18n();
const toast = useToast();
const requestFetch = useRequestFetch();

const {
  data: locationsData,
  pending,
  error,
  refresh,
} = await useAsyncData('admin-locations', () =>
  requestFetch<{ data: LocationWithNodeCount[] }>('/api/admin/locations'),
);

const locations = computed(() => locationsData.value?.data ?? []);

const showCreateModal = ref(false);
const showDeleteModal = ref(false);
const editingLocation = ref<LocationWithNodeCount | null>(null);
const locationToDelete = ref<LocationWithNodeCount | null>(null);
const isSubmitting = ref(false);
const isDeleting = ref(false);

const resetDeleteModal = () => {
  showDeleteModal.value = false;
  locationToDelete.value = null;
};

const form = ref<CreateLocationPayload>({
  short: '',
  long: '',
});

function resetForm() {
  form.value = {
    short: '',
    long: '',
  };
  editingLocation.value = null;
}

function openCreateModal() {
  resetForm();
  showCreateModal.value = true;
}

function openEditModal(location: LocationWithNodeCount) {
  editingLocation.value = location;
  form.value = {
    short: location.short,
    long: location.long || '',
  };
  showCreateModal.value = true;
}

async function handleSubmit() {
  if (!form.value.short) {
    toast.add({ title: t('admin.locations.shortCodeRequired'), color: 'error' });
    return;
  }

  isSubmitting.value = true;

  try {
    if (editingLocation.value) {
      await $fetch(`/api/admin/locations/${editingLocation.value.id}`, {
        method: 'patch',
        body: form.value,
      });
      toast.add({ title: t('admin.locations.locationUpdated'), color: 'success' });
    } else {
      await $fetch('/api/admin/locations', {
        method: 'POST',
        body: form.value,
      });
      toast.add({ title: t('admin.locations.locationCreated'), color: 'success' });
    }

    showCreateModal.value = false;
    resetForm();
    await refresh();
  } catch (err) {
    toast.add({
      title: editingLocation.value
        ? t('admin.locations.updateFailed')
        : t('admin.locations.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete() {
  if (!locationToDelete.value) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/admin/locations/${locationToDelete.value.id}`, {
      method: 'DELETE',
    });
    toast.add({ title: t('admin.locations.locationDeleted'), color: 'success' });
    resetDeleteModal();
    await refresh();
  } catch (err) {
    toast.add({
      title: t('admin.locations.deleteFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    });
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer class="pt-2 sm:pt-4">
        <section class="space-y-4 sm:space-y-6">
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  icon="i-lucide-plus"
                  color="primary"
                  variant="subtle"
                  class="w-full sm:w-auto justify-center"
                  @click="openCreateModal"
                >
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

            <UEmpty
              v-else-if="locations.length === 0"
              icon="i-lucide-map-pin"
              :title="t('admin.locations.noLocationsYet')"
              :description="t('admin.locations.noLocationsYetDescription')"
            />

            <div v-else class="divide-y divide-default">
              <div
                v-for="location in locations"
                :key="location.id"
                class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <UIcon name="i-lucide-map-pin" class="size-4 text-primary" />
                    <span class="font-medium">{{ location.short }}</span>
                    <UBadge v-if="location.nodeCount > 0" size="xs" color="neutral">
                      {{ location.nodeCount }}
                      {{
                        location.nodeCount !== 1
                          ? t('admin.locations.nodes')
                          : t('admin.locations.node')
                      }}
                    </UBadge>
                  </div>
                  <p
                    v-if="location.long"
                    class="mt-1 text-sm text-muted-foreground wrap-break-word"
                  >
                    {{ location.long }}
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                  <UButton
                    icon="i-lucide-pencil"
                    size="xs"
                    variant="ghost"
                    color="info"
                    :aria-label="t('common.edit')"
                    class="w-full sm:w-auto justify-center"
                    @click="openEditModal(location)"
                  />
                  <UButton
                    icon="i-lucide-trash"
                    size="xs"
                    variant="ghost"
                    color="error"
                    :aria-label="t('common.delete')"
                    :disabled="location.nodeCount > 0"
                    class="w-full sm:w-auto justify-center"
                    @click="
                      locationToDelete = location;
                      showDeleteModal = true;
                    "
                  />
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal
      v-model:open="showCreateModal"
      :title="
        editingLocation ? t('admin.locations.editLocation') : t('admin.locations.createLocation')
      "
      :description="
        editingLocation
          ? t('admin.locations.editLocationDescription')
          : t('admin.locations.createLocationDescription')
      "
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="t('admin.locations.shortCode')" name="short" required>
            <UInput
              v-model="form.short"
              :placeholder="t('admin.locations.shortCodePlaceholder')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.locations.shortCodeHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.locations.longName')" name="long">
            <UInput
              v-model="form.long"
              :placeholder="t('admin.locations.longNamePlaceholder')"
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.locations.longNameHelp') }}
            </template>
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex w-full flex-col gap-2 sm:flex-row sm:gap-3">
          <UButton
            variant="ghost"
            color="error"
            class="w-full flex-1 justify-center"
            :disabled="isSubmitting"
            @click="showCreateModal = false"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            color="primary"
            variant="subtle"
            class="w-full flex-1 justify-center"
            :loading="isSubmitting"
            @click="handleSubmit"
          >
            {{ editingLocation ? t('common.update') : t('common.create') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('admin.locations.deleteLocation')"
      :description="t('admin.locations.confirmDeleteDescription')"
      :ui="{ footer: 'flex-col gap-2 sm:flex-row sm:gap-3' }"
    >
      <template #body>
        <UAlert color="error" variant="subtle" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('common.warning') }}</template>
          <template #description>{{ t('admin.locations.deleteLocationWarning') }}</template>
        </UAlert>
        <div v-if="locationToDelete" class="rounded-md bg-muted p-3 text-sm">
          <p class="font-medium">
            {{ t('admin.locations.shortCode') }}:
            <code class="font-mono">{{ locationToDelete.short }}</code>
          </p>
          <p v-if="locationToDelete.long" class="text-muted-foreground mt-2">
            {{ locationToDelete.long }}
          </p>
        </div>
      </template>

      <template #footer>
        <UButton
          variant="ghost"
          class="w-full flex-1 justify-center"
          :disabled="isDeleting"
          @click="resetDeleteModal"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          class="w-full flex-1 justify-center"
          :loading="isDeleting"
          @click="handleDelete"
        >
          {{ t('admin.locations.deleteLocation') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
