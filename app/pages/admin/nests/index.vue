<script setup lang="ts">
import type { NestWithEggCount, CreateNestPayload } from '#shared/types/admin';

definePageMeta({
  auth: true,
  adminTitle: 'Nests',
  adminSubtitle: 'Manage server nests and eggs.',
});

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const requestFetch = useRequestFetch();

const {
  data: nestsData,
  pending,
  error,
  refresh,
} = await useAsyncData('admin-nests', () =>
  requestFetch<{ data: NestWithEggCount[] }>('/api/admin/nests'),
);

const nests = computed(() => nestsData.value?.data ?? []);

const showCreateModal = ref(false);
const showDeleteModal = ref(false);
const isSubmitting = ref(false);
const isDeleting = ref(false);
const nestToDelete = ref<NestWithEggCount | null>(null);

const resetDeleteModal = () => {
  showDeleteModal.value = false;
  nestToDelete.value = null;
};

const form = ref<CreateNestPayload>({
  author: 'support@example.com',
  name: '',
  description: '',
});

function resetForm() {
  form.value = {
    author: 'support@example.com',
    name: '',
    description: '',
  };
}

function openCreateModal() {
  resetForm();
  showCreateModal.value = true;
}

async function handleSubmit() {
  if (!form.value.name || !form.value.author) {
    toast.add({ title: t('admin.nests.nameAndAuthorRequired'), color: 'error' });
    return;
  }

  isSubmitting.value = true;

  try {
    await $fetch('/api/admin/nests', {
      method: 'POST',
      body: form.value,
    });
    toast.add({ title: t('admin.nests.nestCreated'), color: 'success' });
    showCreateModal.value = false;
    resetForm();
    await refresh();
  } catch (err) {
    toast.add({
      title: t('admin.nests.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete() {
  if (!nestToDelete.value) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/admin/nests/${nestToDelete.value.id}`, {
      method: 'DELETE',
    });
    toast.add({ title: t('admin.nests.nestDeleted'), color: 'success' });
    resetDeleteModal();
    await refresh();
  } catch (err) {
    toast.add({
      title: t('admin.nests.deleteFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    });
  } finally {
    isDeleting.value = false;
  }
}

function viewNest(nest: NestWithEggCount) {
  router.push(`/admin/nests/${nest.id}`);
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer class="pt-2 sm:pt-4">
        <section class="space-y-6">
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
                  {{ t('admin.nests.createNest') }}
                </UButton>
                <p v-if="nests.length" class="text-xs text-muted-foreground">
                  {{ t('admin.nests.showingNests', { count: nests.length }) }}
                </p>
              </div>
            </template>

            <div v-if="pending" class="space-y-2">
              <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
            </div>

            <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
              <template #title>{{ t('admin.nests.failedToLoadNests') }}</template>
              <template #description>{{ error.message }}</template>
            </UAlert>

            <UEmpty
              v-else-if="nests.length === 0"
              icon="i-lucide-box"
              :title="t('admin.nests.noNestsYet')"
              :description="t('admin.nests.nestsDescription')"
            />

            <div v-else class="divide-y divide-default">
              <div
                v-for="nest in nests"
                :key="nest.id"
                class="flex flex-col gap-3 py-4 hover:bg-muted/50 cursor-pointer transition-colors sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                @click="viewNest(nest)"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <UIcon name="i-lucide-box" class="size-5 text-primary" />
                    <span class="font-semibold break-words">{{ nest.name }}</span>
                    <UBadge size="sm" color="neutral" variant="outline">
                      {{ nest.eggCount }}
                      {{ nest.eggCount !== 1 ? t('admin.nests.eggs') : t('admin.nests.egg') }}
                    </UBadge>
                  </div>
                  <p v-if="nest.description" class="mt-1 text-sm text-muted-foreground">
                    {{ nest.description }}
                  </p>
                  <div
                    class="mt-2 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span>{{ t('admin.nests.author') }}: {{ nest.author }}</span>
                    <span class="break-all"
                      >{{ t('admin.nests.uuid') }}: {{ nest.uuid.slice(0, 8) }}</span
                    >
                  </div>
                </div>

                <div class="flex items-center gap-2 self-start sm:self-auto" @click.stop>
                  <UButton
                    icon="i-lucide-arrow-right"
                    size="xs"
                    variant="ghost"
                    :aria-label="t('common.view')"
                    @click="viewNest(nest)"
                  />
                  <UButton
                    icon="i-lucide-trash"
                    size="xs"
                    variant="ghost"
                    color="error"
                    :aria-label="t('common.delete')"
                    :disabled="nest.eggCount > 0"
                    @click="
                      nestToDelete = nest;
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
      :title="t('admin.nests.createNest')"
      :description="t('admin.nests.createNestDescription')"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput
              v-model="form.name"
              :placeholder="t('admin.nests.namePlaceholder')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.nests.nameHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('common.description')" name="description">
            <UTextarea
              v-model="form.description"
              :placeholder="t('admin.nests.descriptionPlaceholder')"
              :disabled="isSubmitting"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('admin.nests.author')" name="author" required>
            <UInput
              v-model="form.author"
              :placeholder="t('admin.nests.authorPlaceholder')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.nests.authorHelp') }}
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
            {{ t('admin.nests.createNest') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('admin.nests.deleteNest')"
      :description="t('admin.nests.confirmDeleteDescription')"
      :ui="{ footer: 'flex-col gap-2 sm:flex-row sm:gap-3' }"
    >
      <template #body>
        <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('common.warning') }}</template>
          <template #description>{{ t('admin.nests.deleteNestWarning') }}</template>
        </UAlert>
        <div v-if="nestToDelete" class="rounded-md bg-muted p-3 text-sm">
          <p class="font-medium">
            {{ t('common.name') }}: <span class="text-foreground">{{ nestToDelete.name }}</span>
          </p>
          <p class="text-muted-foreground mt-2">
            {{ t('admin.nests.author') }}: {{ nestToDelete.author }}
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
          icon="i-lucide-trash-2"
          class="w-full flex-1 justify-center"
          :loading="isDeleting"
          @click="handleDelete"
        >
          {{ t('admin.nests.deleteNest') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
