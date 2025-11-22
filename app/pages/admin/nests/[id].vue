<script setup lang="ts">
import type { CreateEggPayload } from '#shared/types/admin-nests'
import type { Nest, Egg } from '#shared/types/nest'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const route = useRoute()
const router = useRouter()
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
    toast.add({ title: 'Name, author, docker image, and startup command are required', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/admin/eggs', {
      method: 'POST',
      body: eggForm.value,
    })
    toast.add({ title: 'Egg created', color: 'success' })
    showCreateEggModal.value = false
    resetEggForm()
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

function viewEgg(egg: Egg) {
  router.push(`/admin/eggs/${egg.id}`)
}

function openImportEggModal() {
  importFile.value = null
  showImportEggModal.value = true
}

async function handleImportEgg() {
  if (!importFile.value) {
    toast.add({ title: 'No file selected', color: 'error' })
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

    toast.add({ title: 'Egg imported successfully', color: 'success' })
    showImportEggModal.value = false
    importFile.value = null
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Import failed',
      description: err instanceof Error ? err.message : 'Invalid egg file',
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
            <template #title>Failed to load nest</template>
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
                  <span>Author: {{ nest.author }}</span>
                  <span>UUID: {{ nest.uuid }}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <UButton icon="i-lucide-upload" variant="outline" @click="openImportEggModal">
                  Import Egg
                </UButton>
                <UButton icon="i-lucide-plus" color="primary" @click="openCreateEggModal">
                  Create Egg
                </UButton>
              </div>
            </header>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">Eggs</h2>
                  <UBadge color="neutral">{{ eggs.length }} total</UBadge>
                </div>
              </template>

              <div v-if="eggs.length === 0" class="py-12 text-center">
                <UIcon name="i-lucide-egg" class="mx-auto size-12 text-muted-foreground opacity-50" />
                <p class="mt-4 text-sm text-muted-foreground">No eggs in this nest yet</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Eggs define specific server types (e.g., Vanilla, Paper, Forge)
                </p>
                <UButton class="mt-4" size="sm" @click="openCreateEggModal">Create your first egg</UButton>
              </div>

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
                      <span>Author: {{ egg.author }}</span>
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

    <UModal v-model:open="showCreateEggModal" title="Create Egg" description="Create a new server type configuration">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleCreateEgg">
          <UFormField label="Name" name="name" required>
            <UInput v-model="eggForm.name" placeholder="Vanilla Minecraft" required :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField label="Description" name="description">
            <UTextarea v-model="eggForm.description" placeholder="Official Minecraft server" :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField label="Docker Image" name="dockerImage" required>
            <UInput v-model="eggForm.dockerImage" placeholder="ghcr.io/pterodactyl/yolks:java_17" required
              :disabled="isSubmitting" class="w-full" />
            <template #help>
              Docker image to use for this server type
            </template>
          </UFormField>

          <UFormField label="Startup Command" name="startup" required>
            <UTextarea v-model="eggForm.startup"
              placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}" required
              :disabled="isSubmitting" class="w-full" />
            <template #help>
              Command to start the server. Use double braces for variables like: SERVER_MEMORY
            </template>
          </UFormField>

          <UFormField label="Author" name="author" required>
            <UInput v-model="eggForm.author" placeholder="support@example.com" required :disabled="isSubmitting"
              class="w-full" />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showCreateEggModal = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="isSubmitting" @click="handleCreateEgg">
            Create Egg
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showImportEggModal" title="Import Egg" description="Import an egg from a JSON file">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Egg JSON File" name="file" required>
            <input
              type="file"
              accept=".json,application/json"
              class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              @change="handleFileChange"
            >
            <template #help>
              Upload a Pterodactyl-compatible egg JSON file
            </template>
          </UFormField>

          <UAlert v-if="importFile" color="primary" variant="soft" icon="i-lucide-file-json">
            <template #title>File selected</template>
            <template #description>{{ importFile.name }} ({{ (importFile.size / 1024).toFixed(2) }} KB)</template>
          </UAlert>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showImportEggModal = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="isSubmitting" :disabled="!importFile" @click="handleImportEgg">
            Import Egg
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
