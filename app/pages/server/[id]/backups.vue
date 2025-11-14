<script setup lang="ts">
import type { ServerBackup } from '#shared/types/server-backups'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const { data: backupsData, pending, error } = await useAsyncData(
  `server-${serverId.value}-backups`,
  () => $fetch<{ data: ServerBackup[] }>(`/api/servers/${serverId.value}/backups`),
  {
    watch: [serverId],
  },
)

const backups = computed(() => backupsData.value?.data || [])

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'In progress…'

  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function getBackupStatus(backup: ServerBackup) {
  if (!backup.completedAt) {
    return { label: 'In progress', color: 'warning' as const }
  }
  if (backup.isSuccessful) {
    return { label: 'Completed', color: 'primary' as const }
  }
  return { label: 'Failed', color: 'error' as const }
}

function getStorageLabel(disk: string): string {
  return disk === 's3' ? 'S3' : 'Wings'
}

const creating = ref(false)
const operatingBackupId = ref<string | null>(null)

async function createBackup() {
  creating.value = true
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups`, {
      method: 'POST',
      body: {
        name: `Backup ${new Date().toLocaleString()}`,
        locked: false,
      },
    })

    useToast().add({
      title: 'Backup started',
      description: 'Your backup is being created',
      color: 'success',
    })

    await refreshNuxtData(`server-${serverId.value}-backups`)
  }
  catch (err) {
    useToast().add({
      title: 'Backup failed',
      description: err instanceof Error ? err.message : 'Failed to create backup',
      color: 'error',
    })
  }
  finally {
    creating.value = false
  }
}

async function downloadBackup(backupId: string) {
  operatingBackupId.value = backupId
  try {
    const response = await $fetch<{ data: { url: string } }>(
      `/api/client/servers/${serverId.value}/backups/${backupId}/download`,
    )

    window.open(response.data.url, '_blank')
  }
  catch (err) {
    useToast().add({
      title: 'Download failed',
      description: err instanceof Error ? err.message : 'Failed to get download URL',
      color: 'error',
    })
  }
  finally {
    operatingBackupId.value = null
  }
}

async function restoreBackup(backupId: string) {
  if (!confirm('Are you sure you want to restore this backup? This will stop your server and overwrite all files.')) {
    return
  }

  operatingBackupId.value = backupId
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupId}/restore`, {
      method: 'POST',
    })

    useToast().add({
      title: 'Restore started',
      description: 'Your backup is being restored',
      color: 'success',
    })
  }
  catch (err) {
    useToast().add({
      title: 'Restore failed',
      description: err instanceof Error ? err.message : 'Failed to restore backup',
      color: 'error',
    })
  }
  finally {
    operatingBackupId.value = null
  }
}

async function toggleLock(backupId: string) {
  operatingBackupId.value = backupId
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupId}/lock`, {
      method: 'POST',
    })

    useToast().add({
      title: 'Lock toggled',
      description: 'Backup lock status has been updated',
      color: 'success',
    })

    await refreshNuxtData(`server-${serverId.value}-backups`)
  }
  catch (err) {
    useToast().add({
      title: 'Lock failed',
      description: err instanceof Error ? err.message : 'Failed to toggle lock',
      color: 'error',
    })
  }
  finally {
    operatingBackupId.value = null
  }
}

async function deleteBackup(backupId: string) {
  if (!confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
    return
  }

  operatingBackupId.value = backupId
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupId}`, {
      method: 'DELETE',
    })

    useToast().add({
      title: 'Backup deleted',
      description: 'The backup has been deleted successfully',
      color: 'success',
    })

    await refreshNuxtData(`server-${serverId.value}-backups`)
  }
  catch (err) {
    useToast().add({
      title: 'Delete failed',
      description: err instanceof Error ? err.message : 'Failed to delete backup',
      color: 'error',
    })
  }
  finally {
    operatingBackupId.value = null
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">Server {{ serverId }} · Backups</p>
            <h1 class="text-xl font-semibold">Backup history</h1>
          </div>
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-archive"
              color="primary"
              :loading="creating"
              @click="createBackup"
            >
              Create backup
            </UButton>
          </div>
        </header>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Recent backups</h2>
            </div>
          </template>

          <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
              <div>
                <p class="font-medium">Failed to load backups</p>
                <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="pending" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
          </div>

          <div v-else-if="backups.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-archive" class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-3 text-sm font-medium">No backups</p>
            <p class="mt-1 text-xs text-muted-foreground">Create your first backup to protect your server data.</p>
          </div>

          <div v-else class="overflow-hidden rounded-lg border border-default">
            <div class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span class="col-span-4">Backup</span>
              <span class="col-span-2">Size</span>
              <span class="col-span-3">Created</span>
              <span class="col-span-2">Storage</span>
              <span class="col-span-1 text-right">Status</span>
            </div>
            <div class="divide-y divide-default">
              <div
                v-for="backup in backups"
                :key="backup.id"
                class="grid grid-cols-12 items-center px-4 py-3 text-sm"
              >
                <div class="col-span-4">
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ backup.name }}</p>
                    <UIcon v-if="backup.isLocked" name="i-lucide-lock" class="size-3 text-muted-foreground" />
                  </div>
                  <p class="text-xs text-muted-foreground">{{ backup.uuid }}</p>
                </div>
                <span class="col-span-2 text-sm text-muted-foreground">{{ formatBytes(backup.bytes) }}</span>
                <span class="col-span-3 text-sm text-muted-foreground">{{ formatDate(backup.completedAt || backup.createdAt) }}</span>
                <span class="col-span-2 text-sm text-muted-foreground">{{ getStorageLabel(backup.disk) }}</span>
                <div class="col-span-1">
                  <UBadge :color="getBackupStatus(backup).color" size="xs">
                    {{ getBackupStatus(backup).label }}
                  </UBadge>
                </div>
                <div class="col-span-12 flex items-center justify-end gap-2">
                  <UButton
                    :icon="backup.isLocked ? 'i-lucide-unlock' : 'i-lucide-lock'"
                    size="xs"
                    variant="ghost"
                    :loading="operatingBackupId === backup.id"
                    @click="toggleLock(backup.id)"
                  >
                    {{ backup.isLocked ? 'Unlock' : 'Lock' }}
                  </UButton>
                  <UButton
                    icon="i-lucide-download"
                    size="xs"
                    variant="ghost"
                    color="primary"
                    :loading="operatingBackupId === backup.id"
                    :disabled="!backup.completedAt || !backup.isSuccessful"
                    @click="downloadBackup(backup.id)"
                  >
                    Download
                  </UButton>
                  <UButton
                    icon="i-lucide-rotate-ccw"
                    size="xs"
                    variant="ghost"
                    color="warning"
                    :loading="operatingBackupId === backup.id"
                    :disabled="!backup.completedAt || !backup.isSuccessful"
                    @click="restoreBackup(backup.id)"
                  >
                    Restore
                  </UButton>
                  <UButton
                    icon="i-lucide-trash-2"
                    size="xs"
                    variant="ghost"
                    color="error"
                    :loading="operatingBackupId === backup.id"
                    :disabled="backup.isLocked"
                    @click="deleteBackup(backup.id)"
                  >
                    Delete
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </section>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>
  </UPage>
</template>
