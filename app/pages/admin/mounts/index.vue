<script setup lang="ts">
import type { MountWithRelations, CreateMountPayload } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()

const { data: mountsData, pending, error, refresh } = await useFetch('/api/admin/mounts', {
  key: 'admin-mounts',
})

const mounts = computed(() => mountsData.value?.data ?? [])

const { data: nodesData } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/wings/nodes', {
  key: 'admin-mount-nodes',
})

const { data: eggsData } = await useFetch<{ data: { id: string; name: string; nestName?: string }[] }>('/api/admin/eggs', {
  key: 'admin-mount-eggs',
})

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
    toast.add({ title: t('admin.mounts.nameSourceTargetRequired'), color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/admin/mounts', {
      method: 'POST',
      body: form.value,
    })
    toast.add({ title: t('admin.mounts.mountCreated'), color: 'success' })
    showCreateModal.value = false
    resetForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.mounts.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(mount: MountWithRelations) {
  if (!confirm(t('admin.mounts.confirmDelete', { name: mount.name }))) {
    return
  }

  try {
    await $fetch(`/api/admin/mounts/${mount.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: t('admin.mounts.mountDeleted'), color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.mounts.deleteFailed'),
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
                <h2 class="text-lg font-semibold">{{ t('admin.mounts.allMounts') }}</h2>
                <UButton icon="i-lucide-plus" color="primary" variant="subtle" @click="openCreateModal">
                  {{ t('admin.mounts.createMount') }}
                </UButton>
              </div>
            </template>

            <div v-if="pending" class="space-y-2">
              <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
            </div>

            <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
              <template #title>{{ t('admin.mounts.failedToLoadMounts') }}</template>
              <template #description>{{ error.message }}</template>
            </UAlert>

            <UEmpty
              v-else-if="mounts.length === 0"
              icon="i-lucide-folder-tree"
              :title="t('admin.mounts.noMountsYet')"
              :description="t('admin.mounts.mountsDescription')"
            />

            <div v-else class="divide-y divide-default">
              <div v-for="mount in mounts" :key="mount.id" class="flex items-start justify-between py-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-folder-tree" class="size-4 text-primary" />
                    <span class="font-medium">{{ mount.name }}</span>
                    <UBadge v-if="mount.readOnly" size="xs" color="neutral">{{ t('admin.mounts.readOnly') }}</UBadge>
                    <UBadge v-if="mount.userMountable" size="xs" color="primary">{{ t('admin.mounts.userMountable') }}</UBadge>
                  </div>
                  <p v-if="mount.description" class="mt-1 text-sm text-muted-foreground">
                    {{ mount.description }}
                  </p>
                  <div class="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div class="flex items-center gap-2">
                      <span>{{ t('admin.mounts.source') }}:</span>
                      <code class="rounded bg-muted px-1 py-0.5">{{ mount.source }}</code>
                      <span>→</span>
                      <code class="rounded bg-muted px-1 py-0.5">{{ mount.target }}</code>
                    </div>
                    <div class="flex items-center gap-3">
                      <span>{{ mount.eggs.length }} {{ mount.eggs.length !== 1 ? t('admin.nests.eggs') : t('admin.nests.egg') }}</span>
                      <span>{{ mount.nodes.length }} {{ mount.nodes.length !== 1 ? t('admin.locations.nodes') : t('admin.locations.node') }}</span>
                      <span>{{ mount.servers.length }} {{ mount.servers.length !== 1 ? t('admin.dashboard.servers') : 'server' }}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error"
                    @click="handleDelete(mount)" />
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateModal" :title="t('admin.mounts.createMount')" :description="t('admin.mounts.createMountDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="t('admin.mounts.name')" name="name" required>
            <UInput v-model="form.name" :placeholder="t('admin.mounts.namePlaceholder')" required :disabled="isSubmitting" class="w-full" />
          </UFormField>

          <UFormField :label="t('common.description')" name="description">
            <UTextarea v-model="form.description" :placeholder="t('admin.mounts.descriptionPlaceholder')" :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.mounts.source')" name="source" required>
            <UInput v-model="form.source" :placeholder="t('admin.mounts.sourcePlaceholder')" required :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              {{ t('admin.mounts.sourceHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.mounts.target')" name="target" required>
            <UInput v-model="form.target" :placeholder="t('admin.mounts.targetPlaceholder')" required :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              {{ t('admin.mounts.targetHelp') }}
            </template>
          </UFormField>

          <div class="flex gap-4">
            <UFormField :label="t('admin.mounts.readOnly')" name="readOnly">
              <UToggle v-model="form.readOnly" :disabled="isSubmitting" />
            </UFormField>

            <UFormField :label="t('admin.mounts.userMountable')" name="userMountable">
              <UToggle v-model="form.userMountable" :disabled="isSubmitting" />
              <template #help>
                {{ t('admin.mounts.userMountableHelp') }}
              </template>
            </UFormField>
          </div>

          <UFormField :label="t('admin.mounts.nodes')" name="nodes">
            <USelect v-model="form.nodes" :items="nodeOptions" multiple value-key="value" :placeholder="t('admin.mounts.selectNodes')"
              :disabled="isSubmitting" />
          </UFormField>

          <UFormField :label="t('admin.mounts.eggs')" name="eggs">
            <USelect v-model="form.eggs" :items="eggOptions" multiple value-key="value" :placeholder="t('admin.mounts.selectEggs')"
              :disabled="isSubmitting" />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="error" :disabled="isSubmitting" @click="showCreateModal = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleSubmit">
            {{ t('admin.mounts.createMount') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
