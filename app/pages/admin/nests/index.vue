<script setup lang="ts">
import type { NestWithEggCount, CreateNestPayload } from '#shared/types/admin-nests'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const toast = useToast()
const router = useRouter()

const { data: nestsData, pending, error, refresh } = await useAsyncData(
  'admin-nests',
  () => $fetch<{ data: NestWithEggCount[] }>('/api/admin/nests'),
)

const nests = computed(() => nestsData.value?.data ?? [])

const showCreateModal = ref(false)
const isSubmitting = ref(false)

const form = ref<CreateNestPayload>({
  author: 'support@example.com',
  name: '',
  description: '',
})

function resetForm() {
  form.value = {
    author: 'support@example.com',
    name: '',
    description: '',
  }
}

function openCreateModal() {
  resetForm()
  showCreateModal.value = true
}

async function handleSubmit() {
  if (!form.value.name || !form.value.author) {
    toast.add({ title: 'Name and author are required', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/admin/nests', {
      method: 'POST',
      body: form.value,
    })
    toast.add({ title: 'Nest created', color: 'success' })
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

async function handleDelete(nest: NestWithEggCount) {
  if (!confirm(`Delete nest "${nest.name}"? This cannot be undone.`)) {
    return
  }

  try {
    await $fetch(`/api/admin/nests/${nest.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Nest deleted', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Delete failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  }
}

function viewNest(nest: NestWithEggCount) {
  router.push(`/admin/nests/${nest.id}`)
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
                <h2 class="text-lg font-semibold">All Nests</h2>
                <UButton icon="i-lucide-plus" color="primary" variant="subtle" @click="openCreateModal">
                  Create Nest
                </UButton>
              </div>
            </template>

            <div v-if="pending" class="space-y-2">
              <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
            </div>

            <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
              <template #title>Failed to load nests</template>
              <template #description>{{ error.message }}</template>
            </UAlert>

            <div v-else-if="nests.length === 0" class="py-12 text-center">
              <UIcon name="i-lucide-box" class="mx-auto size-12 text-muted-foreground opacity-50" />
              <p class="mt-4 text-sm text-muted-foreground">No nests yet</p>
              <p class="mt-1 text-xs text-muted-foreground">
                Nests are categories of game servers (e.g., Minecraft, Source Engine)
              </p>
            </div>

            <div v-else class="divide-y divide-default">
              <div v-for="nest in nests" :key="nest.id"
                class="flex items-start justify-between py-4 hover:bg-muted/50 cursor-pointer transition-colors"
                @click="viewNest(nest)">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-box" class="size-5 text-primary" />
                    <span class="font-semibold">{{ nest.name }}</span>
                    <UBadge size="xs" color="neutral">
                      {{ nest.eggCount }} egg{{ nest.eggCount !== 1 ? 's' : '' }}
                    </UBadge>
                  </div>
                  <p v-if="nest.description" class="mt-1 text-sm text-muted-foreground">
                    {{ nest.description }}
                  </p>
                  <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Author: {{ nest.author }}</span>
                    <span>UUID: {{ nest.uuid.slice(0, 8) }}</span>
                  </div>
                </div>

                <div class="flex items-center gap-2" @click.stop>
                  <UButton icon="i-lucide-arrow-right" size="xs" variant="ghost" @click="viewNest(nest)" />
                  <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error"
                    :disabled="nest.eggCount > 0" @click="handleDelete(nest)" />
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateModal" title="Create Nest" description="Create a new game server category">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField label="Name" name="name" required>
            <UInput v-model="form.name" placeholder="Minecraft" required :disabled="isSubmitting" class="w-full" />
            <template #help>
              Category name (e.g., "Minecraft", "Source Engine", "Voice Servers")
            </template>
          </UFormField>

          <UFormField label="Description" name="description">
            <UTextarea v-model="form.description" placeholder="Minecraft server types and configurations"
              :disabled="isSubmitting" class="w-full" />
          </UFormField>

          <UFormField label="Author" name="author" required>
            <UInput v-model="form.author" placeholder="support@example.com" required :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              Email of the nest author/maintainer
            </template>
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="error" :disabled="isSubmitting" @click="showCreateModal = false">
            Cancel
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleSubmit">
            Create Nest
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
