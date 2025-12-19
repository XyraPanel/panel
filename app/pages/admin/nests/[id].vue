<script setup lang="ts">
import type { CreateEggPayload } from '#shared/types/admin'
import type { Nest, Egg } from '#shared/types/nest'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()

const nestId = computed(() => route.params.id as string)

const { data: nestData, pending, error, refresh } = await useAsyncData(
  `admin-nest-${nestId.value}`,
  () => $fetch<{ data: { nest: Nest; eggs: Egg[] } }>(`/api/admin/nests/${nestId.value}`),
)

const nest = computed(() => nestData.value?.data.nest)
const eggs = computed(() => nestData.value?.data.eggs ?? [])

const showCreateEggModal = ref(false)
const showImportEggModal = ref(false)
const isSubmitting = ref(false)
const importFile = ref<File | null>(null)

const eggForm = ref<CreateEggPayload>({
  nestId: nestId.value,
  author: 'support@example.com',
  name: '',
  description: '',
  dockerImage: '',
  startup: '',
})

function resetEggForm() {
  eggForm.value = {
    nestId: nestId.value,
    author: 'support@example.com',
    name: '',
    description: '',
    dockerImage: '',
    startup: '',
  }
}

function openCreateEggModal() {
  resetEggForm()
  showCreateEggModal.value = true
}

async function handleCreateEgg() {
  if (!eggForm.value.name || !eggForm.value.author || !eggForm.value.dockerImage || !eggForm.value.startup) {
    toast.add({ title: t('admin.nests.createEgg.requiredFields'), color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/admin/eggs', {
      method: 'POST',
      body: eggForm.value,
    })
    toast.add({ title: t('admin.nests.createEgg.eggCreated'), color: 'success' })
    showCreateEggModal.value = false
    resetEggForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.nests.createEgg.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

function viewEgg(egg: Egg) {
  router.push(`/admin/eggs/${egg.id}`)
}

function openImportEggModal() {
  importFile.value = null
  showImportEggModal.value = true
}

async function handleImportEgg() {
  if (!importFile.value) {
    toast.add({ title: t('admin.nests.createEgg.noFileSelected'), color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    const fileContent = await importFile.value.text()
    const eggData = JSON.parse(fileContent)

    await $fetch('/api/admin/eggs/import', {
      method: 'POST',
      body: {
        nestId: nestId.value,
        eggData,
      },
    })

    toast.add({ title: t('admin.nests.createEgg.eggImportedSuccessfully'), color: 'success' })
    showImportEggModal.value = false
    importFile.value = null
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.nests.createEgg.importFailed'),
      description: err instanceof Error ? err.message : t('admin.nests.createEgg.invalidEggFile'),
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    importFile.value = target.files[0] || null
  } else {
    importFile.value = null
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <div v-if="pending" class="space-y-4">
            <USkeleton class="h-8 w-64" />
            <USkeleton class="h-24 w-full" />
          </div>

          <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('admin.nests.failedToLoadNest') }}</template>
            <template #description>{{ error.message }}</template>
          </UAlert>

          <template v-else-if="nest">
            <header class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <UButton icon="i-lucide-arrow-left" size="xs" variant="ghost" to="/admin/nests" />
                  <h1 class="text-xl font-semibold">{{ nest.name }}</h1>
                </div>
                <p v-if="nest.description" class="mt-1 text-sm text-muted-foreground">
                  {{ nest.description }}
                </p>
                <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{{ t('admin.nests.author') }}: {{ nest.author }}</span>
                  <span>{{ t('admin.nests.uuid') }}: {{ nest.uuid }}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <UButton icon="i-lucide-upload" variant="outline" @click="openImportEggModal">
                  {{ t('admin.nests.createEgg.importEgg') }}
                </UButton>
                <UButton icon="i-lucide-plus" color="primary" @click="openCreateEggModal">
                  {{ t('admin.nests.createEgg.createEgg') }}
                </UButton>
              </div>
            </header>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">{{ t('admin.nests.createEgg.eggs') }}</h2>
                  <UBadge color="neutral">{{ eggs.length }} {{ t('common.all') }}</UBadge>
                </div>
              </template>

              <UEmpty
                v-if="eggs.length === 0"
                icon="i-lucide-egg"
                :title="t('admin.nests.createEgg.noEggsInNest')"
                :description="t('admin.nests.createEgg.eggsDescription')"
              >
                <UButton class="mt-4" size="sm" @click="openCreateEggModal">{{ t('admin.nests.createEgg.createFirstEgg') }}</UButton>
              </UEmpty>

              <div v-else class="divide-y divide-default">
                <div v-for="egg in eggs" :key="egg.id"
                  class="flex items-start justify-between py-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  @click="viewEgg(egg)">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-egg" class="size-4 text-primary" />
                      <span class="font-medium">{{ egg.name }}</span>
                    </div>
                    <p v-if="egg.description" class="mt-1 text-sm text-muted-foreground">
                      {{ egg.description }}
                    </p>
                    <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span class="flex items-center gap-1">
                        <UIcon name="i-lucide-container" class="size-3" />
                        {{ egg.dockerImage }}
                      </span>
                      <span>{{ t('admin.nests.author') }}: {{ egg.author }}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2" @click.stop>
                    <UButton icon="i-lucide-arrow-right" size="xs" variant="ghost" @click="viewEgg(egg)" />
                  </div>
                </div>
              </div>
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateEggModal" :title="t('admin.nests.createEgg.createEgg')" :description="t('admin.nests.createEgg.createEggDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleCreateEgg">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="eggForm.name" :placeholder="t('admin.nests.createEgg.namePlaceholder')" required :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField :label="t('common.description')" name="description">
            <UTextarea v-model="eggForm.description" :placeholder="t('admin.nests.createEgg.descriptionPlaceholder')" :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.nests.createEgg.dockerImage')" name="dockerImage" required>
            <UInput v-model="eggForm.dockerImage" :placeholder="t('admin.nests.createEgg.dockerImagePlaceholder')" required
              :disabled="isSubmitting" class="w-full" />
            <template #help>
              {{ t('admin.nests.createEgg.dockerImageHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.nests.createEgg.startupCommand')" name="startup" required>
            <UTextarea v-model="eggForm.startup"
              :placeholder="t('admin.nests.createEgg.startupCommandPlaceholder')" required
              :disabled="isSubmitting" class="w-full" />
            <template #help>
              {{ t('admin.nests.createEgg.startupCommandHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.nests.author')" name="author" required>
            <UInput v-model="eggForm.author" :placeholder="t('admin.nests.authorPlaceholder')" required :disabled="isSubmitting"
              class="w-full" />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showCreateEggModal = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" :loading="isSubmitting" @click="handleCreateEgg">
            {{ t('admin.nests.createEgg.createEgg') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showImportEggModal" :title="t('admin.nests.createEgg.importEgg')" :description="t('admin.nests.createEgg.importEggDescription')">
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('admin.nests.createEgg.eggJsonFile')" name="file" required>
            <input
              type="file"
              accept=".json,application/json"
              class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              @change="handleFileChange"
            >
            <template #help>
              {{ t('admin.nests.createEgg.eggJsonFileHelp') }}
            </template>
          </UFormField>

          <UAlert v-if="importFile" color="primary" variant="soft" icon="i-lucide-file-json">
            <template #title>{{ t('admin.nests.createEgg.fileSelected') }}</template>
            <template #description>{{ importFile.name }} ({{ (importFile.size / 1024).toFixed(2) }} KB)</template>
          </UAlert>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showImportEggModal = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" :loading="isSubmitting" :disabled="!importFile" @click="handleImportEgg">
            {{ t('admin.nests.createEgg.importEgg') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
