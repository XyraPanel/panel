<script setup lang="ts">
import type { ServerBackup } from '#shared/types/server'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const { t } = useI18n()
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
  if (bytes === 0) return t('common.na')
  const k = 1024
  const sizes = [t('common.bytes'), t('common.kb'), t('common.mb'), t('common.gb'), t('common.tb')]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

function formatDate(dateString: string | null): string {
  if (!dateString) return t('server.backups.inProgressEllipsis')

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
    return { label: t('server.backups.inProgress'), color: 'warning' as const }
  }
  if (backup.isSuccessful) {
    return { label: t('server.backups.completed'), color: 'primary' as const }
  }
  return { label: t('server.backups.failed'), color: 'error' as const }
}

function getStorageLabel(disk: string): string {
  return disk === 's3' ? t('server.backups.storageS3') : t('server.backups.storageWings')
}

const creating = ref(false)
const operatingBackupId = ref<string | null>(null)

async function createBackup() {
  creating.value = true
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups`, {
      method: 'POST',
      body: {
        name: t('server.backups.defaultBackupName', { date: new Date().toLocaleString() }),
        locked: false,
      },
    })

    useToast().add({
      title: t('common.success'),
      description: t('server.backups.backupStartedDescription'),
      color: 'success',
    })

    await refreshNuxtData(`server-${serverId.value}-backups`)
  }
  catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.backupFailed'),
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
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.downloadFailed'),
      color: 'error',
    })
  }
  finally {
    operatingBackupId.value = null
  }
}

async function restoreBackup(backupId: string) {
  if (!confirm(t('server.backups.confirmRestore'))) {
    return
  }

  operatingBackupId.value = backupId
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupId}/restore`, {
      method: 'POST',
    })

    useToast().add({
      title: t('common.success'),
      description: t('server.backups.restoreStartedDescription'),
      color: 'success',
    })
  }
  catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.restoreFailed'),
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
      title: t('common.success'),
      description: t('server.backups.lockToggledDescription'),
      color: 'success',
    })

    await refreshNuxtData(`server-${serverId.value}-backups`)
  }
  catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.lockFailed'),
      color: 'error',
    })
  }
  finally {
    operatingBackupId.value = null
  }
}

async function deleteBackup(backupId: string) {
  if (!confirm(t('server.backups.confirmDelete'))) {
    return
  }

  operatingBackupId.value = backupId
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupId}`, {
      method: 'DELETE',
    })

    useToast().add({
      title: t('common.success'),
      description: t('server.backups.backupDeletedDescription'),
      color: 'success',
    })

    await refreshNuxtData(`server-${serverId.value}-backups`)
  }
  catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.deleteFailed'),
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
      <UContainer>
        <section class="space-y-6">
          <header class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs text-muted-foreground">{{ t('server.backups.serverBackups', { id: serverId }) }}</p>
              <h1 class="text-xl font-semibold">{{ t('server.backups.backupHistory') }}</h1>
            </div>
            <div class="flex gap-2">
              <UButton
                icon="i-lucide-archive"
                color="primary"
                :loading="creating"
                @click="createBackup"
              >
                {{ t('server.backups.createBackup') }}
              </UButton>
            </div>
          </header>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('server.backups.recentBackups') }}</h2>
              </div>
            </template>

            <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
                <div>
                  <p class="font-medium">{{ t('server.backups.failedToLoad') }}</p>
                  <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
                </div>
              </div>
            </div>

            <div v-else-if="pending" class="flex items-center justify-center py-12">
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
            </div>

            <div v-else-if="backups.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
              <UIcon name="i-lucide-archive" class="mx-auto size-12 text-muted-foreground/50" />
              <p class="mt-3 text-sm font-medium">{{ t('server.backups.noBackups') }}</p>
              <p class="mt-1 text-xs text-muted-foreground">{{ t('server.backups.noBackupsDescription') }}</p>
            </div>

            <div v-else class="overflow-hidden rounded-lg border border-default">
              <div class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span class="col-span-4">{{ t('server.backups.backup') }}</span>
                <span class="col-span-2">{{ t('server.backups.size') }}</span>
                <span class="col-span-3">{{ t('server.backups.created') }}</span>
                <span class="col-span-2">{{ t('server.backups.storage') }}</span>
                <span class="col-span-1 text-right">{{ t('server.backups.status') }}</span>
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
                      {{ backup.isLocked ? t('server.backups.unlock') : t('server.backups.lock') }}
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
                      {{ t('server.backups.download') }}
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
                      {{ t('server.backups.restore') }}
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
                      {{ t('server.backups.delete') }}
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
  </UPage>
</template>
