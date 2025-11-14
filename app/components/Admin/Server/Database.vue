<script setup lang="ts">
import type { AdminServerDatabaseListResponse, AdminServerDatabase } from '#shared/types/admin-servers'

const props = defineProps<{
  serverId: string
}>()

const toast = useToast()
const showCreateModal = ref(false)
const isSubmitting = ref(false)

const { data: databasesData, refresh } = await useFetch<AdminServerDatabaseListResponse>(`/api/admin/servers/${props.serverId}/databases`, {
  key: `server-databases-${props.serverId}`,
})
const databases = computed<AdminServerDatabase[]>(() => databasesData.value?.data ?? [])

const form = reactive({
  database: '',
  remote: '%',
})

function resetForm() {
  form.database = ''
  form.remote = '%'
}

async function handleCreate() {
  isSubmitting.value = true

  try {
    await $fetch<unknown>(`/api/admin/servers/${props.serverId}/databases`, {
      method: 'POST',
      body: form,
    })

    toast.add({
      title: 'Database created',
      description: 'Server database has been created successfully',
      color: 'success',
    })

    showCreateModal.value = false
    resetForm()
    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to create database',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function handleDelete(databaseId: string, databaseName: string) {
  if (!confirm(`Are you sure you want to delete the database "${databaseName}"?`)) {
    return
  }

  try {
    await $fetch(`/api/admin/servers/${props.serverId}/databases/${databaseId}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Database deleted',
      description: 'The database has been removed',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to delete database',
      color: 'error',
    })
  }
}

async function rotatePassword(databaseId: string) {
  try {
    await $fetch<unknown>(`/api/admin/servers/${props.serverId}/databases/${databaseId}/rotate-password`, {
      method: 'POST',
    })

    toast.add({
      title: 'Password rotated',
      description: 'Database password has been changed',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to rotate password',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted-foreground">
        Manage MySQL databases for this server
      </p>
      <UButton icon="i-lucide-plus" color="primary" @click="showCreateModal = true">
        Create Database
      </UButton>
    </div>

    <div v-if="databases.length === 0" class="rounded-lg border border-default p-8 text-center">
      <UIcon name="i-lucide-database" class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-2 text-sm text-muted-foreground">
        No databases created yet
      </p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="db in databases" :key="db.id"
        class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="flex-1 space-y-1">
          <div class="flex items-center gap-2">
            <code class="text-sm font-medium">{{ db.database }}</code>
            <UBadge size="xs" color="neutral">{{ db.username }}</UBadge>
          </div>
          <p class="text-xs text-muted-foreground">
            Host: {{ db.host }} | Remote: {{ db.remote }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-key" variant="soft" size="sm" @click="rotatePassword(db.id)">
            Rotate Password
          </UButton>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm"
            @click="handleDelete(db.id, db.database)" />
        </div>
      </div>
    </div>

    <UModal v-model:open="showCreateModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Create Database</h3>
        </template>

        <form class="space-y-4" @submit.prevent="handleCreate">
          <UFormField label="Database Name" name="database" required>
            <UInput v-model="form.database" placeholder="s1_minecraft" :disabled="isSubmitting" class="w-full" />
            <template #help>
              Database name will be prefixed with server identifier
            </template>
          </UFormField>

          <UFormField label="Remote Connections" name="remote" required>
            <UInput v-model="form.remote" placeholder="%" :disabled="isSubmitting" class="w-full" />
            <template #help>
              % = allow from anywhere, or specify IP address
            </template>
          </UFormField>
        </form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" :disabled="isSubmitting" @click="showCreateModal = false">
              Cancel
            </UButton>
            <UButton color="primary" :loading="isSubmitting" @click="handleCreate">
              Create Database
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
