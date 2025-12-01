<script setup lang="ts">
import type { DatabaseHostWithStats, CreateDatabaseHostPayload } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()

const { data: hostsData, pending, error, refresh } = await useAsyncData(
  'admin-database-hosts',
  () => $fetch<{ data: DatabaseHostWithStats[] }>('/api/admin/database-hosts'),
)

const hosts = computed(() => hostsData.value?.data ?? [])

const showCreateModal = ref(false)
const isSubmitting = ref(false)

const form = ref<CreateDatabaseHostPayload>({
  name: '',
  hostname: '',
  port: 3306,
  username: '',
  password: '',
  database: '',
  maxDatabases: 100,
})

function resetForm() {
  form.value = {
    name: '',
    hostname: '',
    port: 3306,
    username: '',
    password: '',
    database: '',
    maxDatabases: 100,
  }
}

function openCreateModal() {
  resetForm()
  showCreateModal.value = true
}

async function handleSubmit() {
  if (!form.value.name || !form.value.hostname || !form.value.username || !form.value.password) {
    toast.add({ title: t('admin.databaseHosts.requiredFields'), color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    await $fetch('/api/admin/database-hosts', {
      method: 'POST',
      body: form.value,
    })
    toast.add({ title: t('admin.databaseHosts.databaseHostCreated'), color: 'success' })
    showCreateModal.value = false
    resetForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.databaseHosts.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(host: DatabaseHostWithStats) {
  if (!confirm(t('admin.databaseHosts.confirmDelete', { name: host.name }))) {
    return
  }

  try {
    await $fetch(`/api/admin/database-hosts/${host.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: t('admin.databaseHosts.databaseHostDeleted'), color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: t('admin.databaseHosts.deleteFailed'),
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
                <h2 class="text-lg font-semibold">{{ t('admin.databaseHosts.allDatabaseHosts') }}</h2>
                <UButton icon="i-lucide-plus" color="primary" variant="subtle" @click="openCreateModal">
                  {{ t('admin.databaseHosts.addDatabaseHost') }}
                </UButton>
              </div>
            </template>

            <div v-if="pending" class="space-y-2">
              <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
            </div>

            <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
              <template #title>{{ t('admin.databaseHosts.failedToLoadDatabaseHosts') }}</template>
              <template #description>{{ error.message }}</template>
            </UAlert>

            <div v-else-if="hosts.length === 0" class="py-12 text-center">
              <UIcon name="i-lucide-database" class="mx-auto size-12 text-muted-foreground opacity-50" />
              <p class="mt-4 text-sm text-muted-foreground">{{ t('admin.databaseHosts.noDatabaseHostsYet') }}</p>
            </div>

            <div v-else class="divide-y divide-default">
              <div v-for="host in hosts" :key="host.id" class="flex items-start justify-between py-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-database" class="size-4 text-primary" />
                    <span class="font-medium">{{ host.name }}</span>
                    <UBadge v-if="host.databaseCount > 0" size="xs" color="neutral">
                      {{ host.databaseCount }} / {{ host.maxDatabases || '∞' }} {{ t('admin.databaseHosts.databases') }}
                    </UBadge>
                  </div>
                  <div class="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                    <span class="flex items-center gap-1">
                      <UIcon name="i-lucide-server" class="size-3" />
                      {{ host.hostname }}:{{ host.port }}
                    </span>
                    <span class="flex items-center gap-1">
                      <UIcon name="i-lucide-user" class="size-3" />
                      {{ host.username }}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error"
                    :disabled="host.databaseCount > 0" @click="handleDelete(host)" />
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateModal" :title="t('admin.databaseHosts.addDatabaseHost')"
      :description="t('admin.databaseHosts.addDatabaseHostDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="form.name" :placeholder="t('admin.databaseHosts.namePlaceholder')" required :disabled="isSubmitting" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('admin.databaseHosts.hostname')" name="hostname" required>
              <UInput v-model="form.hostname" :placeholder="t('admin.databaseHosts.hostnamePlaceholder')" required :disabled="isSubmitting"
                class="w-full" />
            </UFormField>

            <UFormField :label="t('admin.databaseHosts.port')" name="port" required>
              <UInput v-model.number="form.port" type="number" :placeholder="t('admin.databaseHosts.portPlaceholder')" required :disabled="isSubmitting"
                class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('auth.username')" name="username" required>
              <UInput v-model="form.username" :placeholder="t('admin.databaseHosts.usernamePlaceholder')" required :disabled="isSubmitting"
                class="w-full" />
            </UFormField>

            <UFormField :label="t('auth.password')" name="password" required>
              <UInput v-model="form.password" type="password" :placeholder="t('admin.databaseHosts.passwordPlaceholder')" required :disabled="isSubmitting"
                class="w-full" />
            </UFormField>
          </div>

          <UFormField :label="t('admin.databaseHosts.defaultDatabase')" name="database">
            <UInput v-model="form.database" :placeholder="t('admin.databaseHosts.defaultDatabasePlaceholder')" :disabled="isSubmitting" class="w-full" />
            <template #help>
              {{ t('admin.databaseHosts.defaultDatabaseHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.databaseHosts.maxDatabases')" name="maxDatabases">
            <UInput v-model.number="form.maxDatabases" type="number" :placeholder="t('admin.databaseHosts.maxDatabasesPlaceholder')" :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              {{ t('admin.databaseHosts.maxDatabasesHelp') }}
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
            {{ t('admin.databaseHosts.addHost') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
