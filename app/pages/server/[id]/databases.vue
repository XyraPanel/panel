<script setup lang="ts">
import type { ServerDatabase } from '#shared/types/server-databases'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const { data: databasesData, pending, error } = await useAsyncData(
  `server-${serverId.value}-databases`,
  () => $fetch<{ data: ServerDatabase[] }>(`/api/servers/${serverId.value}/databases`),
  {
    watch: [serverId],
  },
)

const databases = computed(() => databasesData.value?.data || [])

function getStatusColor(status: string) {
  switch (status) {
    case 'ready':
      return 'primary'
    case 'revoking':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'neutral'
  }
}

function getStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

const showCreateModal = ref(false)
const showPasswordModal = ref(false)
const selectedDatabase = ref<(ServerDatabase & { password?: string }) | null>(null)
const operatingDatabaseId = ref<string | null>(null)
const newDatabaseForm = ref({
  name: '',
  remote: '%',
})

async function createDatabase() {
  if (!newDatabaseForm.value.name) {
    useToast().add({
      title: 'Validation error',
      description: 'Database name is required',
      color: 'error',
    })
    return
  }

  try {
    const response = await $fetch<{ data: { id: string; name: string; username: string; password: string; host: string; port: number } }>(
      `/api/client/servers/${serverId.value}/databases`,
      {
        method: 'POST',
        body: newDatabaseForm.value,
      },
    )

    selectedDatabase.value = {
      id: response.data.id,
      name: response.data.name,
      username: response.data.username,
      password: response.data.password,
      host: { hostname: response.data.host, port: response.data.port },
      remote: newDatabaseForm.value.remote,
      status: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ServerDatabase & { password: string }

    showPasswordModal.value = true

    useToast().add({
      title: 'Database created',
      description: `Database ${response.data.name} has been created`,
      color: 'success',
    })

    showCreateModal.value = false
    newDatabaseForm.value = { name: '', remote: '%' }

    await refreshNuxtData(`server-${serverId.value}-databases`)
  }
  catch (err) {
    useToast().add({
      title: 'Create failed',
      description: err instanceof Error ? err.message : 'Failed to create database',
      color: 'error',
    })
  }
}

async function rotatePassword(databaseId: string) {
  operatingDatabaseId.value = databaseId
  try {
    const response = await $fetch<{ data: { password: string } }>(
      `/api/client/servers/${serverId.value}/databases/${databaseId}/rotate`,
      {
        method: 'POST',
      },
    )

    const db = databases.value.find(d => d.id === databaseId)
    if (db) {
      selectedDatabase.value = { ...db, password: response.data.password } as ServerDatabase & { password: string }
      showPasswordModal.value = true
    }

    useToast().add({
      title: 'Password rotated',
      description: 'Database password has been updated',
      color: 'success',
    })
  }
  catch (err) {
    useToast().add({
      title: 'Rotation failed',
      description: err instanceof Error ? err.message : 'Failed to rotate password',
      color: 'error',
    })
  }
  finally {
    operatingDatabaseId.value = null
  }
}

const showDeleteModal = ref(false)
const databaseToDelete = ref<string | null>(null)

function confirmDelete(databaseId: string) {
  databaseToDelete.value = databaseId
  showDeleteModal.value = true
}

async function deleteDatabase() {
  if (!databaseToDelete.value) return

  operatingDatabaseId.value = databaseToDelete.value
  try {
    await $fetch(`/api/client/servers/${serverId.value}/databases/${databaseToDelete.value}`, {
      method: 'DELETE',
    })

    useToast().add({
      title: 'Database deleted',
      description: 'The database has been deleted successfully',
      color: 'success',
    })

    showDeleteModal.value = false
    databaseToDelete.value = null

    await refreshNuxtData(`server-${serverId.value}-databases`)
  }
  catch (err) {
    useToast().add({
      title: 'Delete failed',
      description: err instanceof Error ? err.message : 'Failed to delete database',
      color: 'error',
    })
  }
  finally {
    operatingDatabaseId.value = null
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <header class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs text-muted-foreground">Server {{ serverId }} · Databases</p>
              <h1 class="text-xl font-semibold">Linked databases</h1>
            </div>
            <div class="flex gap-2">
              <UButton
                icon="i-lucide-plus"
                color="primary"
                @click="showCreateModal = true"
              >
                Create Database
              </UButton>
            </div>
          </header>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Linked databases</h2>
              </div>
            </template>

            <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
                <div>
                  <p class="font-medium">Failed to load databases</p>
                  <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
                </div>
              </div>
            </div>

            <div v-else-if="pending" class="flex items-center justify-center py-12">
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
            </div>

            <ServerEmptyState
              v-else-if="databases.length === 0"
              icon="i-lucide-database"
              title="No databases"
              description="Create a database to get started."
            >
              <UButton icon="i-lucide-plus" @click="showCreateModal = true">
                Create Database
              </UButton>
            </ServerEmptyState>

            <div v-else class="overflow-hidden rounded-lg border border-default">
              <div class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span class="col-span-3">Name</span>
                <span class="col-span-3">Host</span>
                <span class="col-span-3">Username</span>
                <span class="col-span-2">Remote</span>
                <span class="col-span-1">Status</span>
              </div>
              <div class="divide-y divide-default">
                <div
                  v-for="db in databases"
                  :key="db.id"
                  class="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
                >
                  <div class="col-span-3">
                    <div class="font-medium">{{ db.name }}</div>
                  </div>
                  <div class="col-span-3 text-sm text-muted-foreground">
                    {{ db.host.hostname }}:{{ db.host.port }}
                  </div>
                  <div class="col-span-3">
                    <code class="rounded bg-muted px-2 py-1 text-xs">{{ db.username }}</code>
                  </div>
                  <div class="col-span-2 text-xs text-muted-foreground">
                    {{ db.remote }}
                  </div>
                  <div class="col-span-1">
                    <UBadge :color="getStatusColor(db.status)" size="xs">
                      {{ getStatusLabel(db.status) }}
                    </UBadge>
                  </div>
                  <div class="col-span-12 flex items-center justify-end gap-2">
                    <UButton
                      icon="i-lucide-key-round"
                      size="xs"
                      variant="ghost"
                      color="primary"
                      :loading="operatingDatabaseId === db.id"
                      @click="rotatePassword(db.id)"
                    >
                      Rotate Password
                    </UButton>
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      variant="ghost"
                      color="error"
                      :loading="operatingDatabaseId === db.id"
                      @click="confirmDelete(db.id)"
                    >
                      Delete
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>

    <UModal
      v-model:open="showCreateModal"
      title="Create Database"
      description="Create a new database for this server"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Database Name" name="name" required>
            <UInput
              v-model="newDatabaseForm.name"
              icon="i-lucide-database"
              placeholder="my_database"
              class="w-full"
              @keyup.enter="createDatabase"
            />
            <template #help>
              Will be prefixed with server ID
            </template>
          </UFormField>

          <UFormField label="Remote Access" name="remote">
            <UInput
              v-model="newDatabaseForm.remote"
              icon="i-lucide-globe"
              placeholder="%"
              class="w-full"
            />
            <template #help>
              Use % for all IPs or specify an IP address
            </template>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showCreateModal = false">
            Cancel
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            :disabled="!newDatabaseForm.name"
            @click="createDatabase"
          >
            Create Database
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showPasswordModal"
      title="New Password"
      description="Save this password now. You won't be able to see it again!"
    >
      <template #body>
        <div v-if="selectedDatabase" class="space-y-4">
          <UAlert color="warning" icon="i-lucide-alert-triangle">
            Save this password now. You won't be able to see it again!
          </UAlert>

          <UFormField label="Password" name="password">
            <div class="flex items-center gap-2">
              <UInput
                :model-value="selectedDatabase.password"
                readonly
                icon="i-lucide-key"
                class="font-mono w-full"
              />
              <ServerCopyButton
                v-if="selectedDatabase.password"
                :text="selectedDatabase.password"
                label="Password"
              />
            </div>
            <template #help>
              This password will only be shown once
            </template>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            icon="i-lucide-check"
            color="primary"
            @click="showPasswordModal = false"
          >
            I've Saved It
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Delete Database</h3>
        </template>

        <div class="space-y-4">
          <UAlert color="error" icon="i-lucide-alert-triangle">
            <template #title>This action cannot be undone!</template>
            <template #description>
              Deleting this database will permanently remove all data. Any applications using this database will stop working.
            </template>
          </UAlert>

          <p class="text-sm text-muted-foreground">
            Are you sure you want to delete this database?
          </p>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              :disabled="operatingDatabaseId !== null"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="operatingDatabaseId !== null"
              :disabled="operatingDatabaseId !== null"
              @click="deleteDatabase"
            >
              Yes, Delete Database
            </UButton>
          </div>
        </div>
      </UCard>
    </UModal>
  </UPage>
</template>
