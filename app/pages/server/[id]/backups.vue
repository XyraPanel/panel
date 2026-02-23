<script setup lang="ts">
import type { ServerBackup } from '#shared/types/server';

const route = useRoute();

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const serverId = computed(() => route.params.id as string);

const {
  data: backupsData,
  pending,
  error,
  refresh: refreshBackups,
} = await useFetch<{ data: ServerBackup[] }>(
  () => `/api/client/servers/${serverId.value}/backups`,
  {
    key: () => `server-${serverId.value}-backups`,
    watch: [serverId],
    default: () => ({ data: [] }),
  },
);

const backups = computed(() => backupsData.value?.data || []);

function formatBytes(bytes: number): string {
  if (bytes === 0) return t('common.na');
  const k = 1024;
  const sizes = [t('common.bytes'), t('common.kb'), t('common.mb'), t('common.gb'), t('common.tb')];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function getBackupStatus(backup: ServerBackup) {
  if (!backup.completedAt) {
    return {
      label: t('server.backups.inProgress'),
      color: 'warning' as const,
      variant: 'outline' as const,
    };
  }
  if (backup.isSuccessful) {
    return {
      label: t('server.backups.completed'),
      color: 'success' as const,
      variant: 'subtle' as const,
    };
  }
  return {
    label: t('server.backups.failed'),
    color: 'error' as const,
    variant: 'outline' as const,
  };
}

function getStorageLabel(disk: string): string {
  return disk === 's3' ? t('server.backups.storageS3') : t('server.backups.storageWings');
}

const creating = ref(false);
const operatingBackupId = ref<string | null>(null);
const toast = useToast();
const showDeleteModal = ref(false);
const showRestoreModal = ref(false);
const backupToDelete = ref<ServerBackup | null>(null);
const backupToRestore = ref<ServerBackup | null>(null);

async function createBackup() {
  creating.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups`, {
      method: 'POST',
      body: {
        name: t('server.backups.defaultBackupName', { date: new Date().toISOString() }),
        locked: false,
      },
    });

    toast.add({
      title: t('common.success'),
      description: t('server.backups.backupStartedDescription'),
      color: 'success',
    });

    await refreshBackups();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.backupFailed'),
      color: 'error',
    });
  } finally {
    creating.value = false;
  }
}

async function downloadBackup(backupUuid: string) {
  operatingBackupId.value = backupUuid;
  try {
    const response = await $fetch<{ attributes: { url: string } }>(
      `/api/client/servers/${serverId.value}/backups/${backupUuid}/download`,
    );

    await navigateTo(response.attributes.url, { external: true, open: { target: '_blank' } });

    toast.add({
      title: t('common.success'),
      description: t('server.backups.downloadStarted'),
      color: 'success',
    });
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.downloadFailed'),
      color: 'error',
    });
  } finally {
    operatingBackupId.value = null;
  }
}

function openRestoreModal(backup: ServerBackup) {
  backupToRestore.value = backup;
  showRestoreModal.value = true;
}

function closeRestoreModal() {
  showRestoreModal.value = false;
  backupToRestore.value = null;
}

async function confirmRestore() {
  if (!backupToRestore.value) return;

  const backupUuid = backupToRestore.value.uuid;
  operatingBackupId.value = backupUuid;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupUuid}/restore`, {
      method: 'POST',
    });

    toast.add({
      title: t('common.success'),
      description: t('server.backups.restoreStartedDescription'),
      color: 'success',
    });
    closeRestoreModal();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.restoreFailed'),
      color: 'error',
    });
  } finally {
    operatingBackupId.value = null;
  }
}

async function toggleLock(backupUuid: string) {
  operatingBackupId.value = backupUuid;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${backupUuid}/lock`, {
      method: 'POST',
    });

    toast.add({
      title: t('common.success'),
      description: t('server.backups.lockToggledDescription'),
      color: 'success',
    });

    await refreshBackups();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.lockFailed'),
      color: 'error',
    });
  } finally {
    operatingBackupId.value = null;
  }
}

function openDeleteModal(backup: ServerBackup) {
  if (backup.isLocked) {
    toast.add({
      title: t('common.error'),
      description: t('server.backups.deleteLockedError'),
      color: 'error',
    });
    return;
  }
  backupToDelete.value = backup;
  showDeleteModal.value = true;
}

function closeDeleteModal() {
  showDeleteModal.value = false;
  backupToDelete.value = null;
}

async function confirmDelete() {
  if (!backupToDelete.value) return;

  const targetBackup = backupToDelete.value;
  operatingBackupId.value = targetBackup.uuid;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/backups/${targetBackup.uuid}`, {
      method: 'DELETE',
    });

    if (backupsData.value?.data) {
      const index = backupsData.value.data.findIndex((b) => b.uuid === targetBackup.uuid);
      if (index !== -1) {
        backupsData.value.data.splice(index, 1);
      }
    }

    toast.add({
      title: t('common.success'),
      description: t('server.backups.backupDeletedDescription'),
      color: 'success',
    });
    closeDeleteModal();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.backups.deleteFailed'),
      color: 'error',
    });
  } finally {
    operatingBackupId.value = null;
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
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-lg font-semibold">{{ t('server.backups.recentBackups') }}</h2>
                <UButton
                  icon="i-lucide-archive"
                  color="primary"
                  variant="subtle"
                  :loading="creating"
                  class="ml-auto"
                  @click="createBackup"
                >
                  {{ t('server.backups.createBackup') }}
                </UButton>
              </div>
            </template>

            <div
              v-if="error"
              class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
                <div>
                  <p class="font-medium">{{ t('server.backups.failedToLoad') }}</p>
                  <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
                </div>
              </div>
            </div>

            <div
              v-else-if="pending || !backupsData"
              class="overflow-hidden rounded-lg border border-default"
            >
              <div
                class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <span class="col-span-4">{{ t('server.backups.backup') }}</span>
                <span class="col-span-2">{{ t('server.backups.size') }}</span>
                <span class="col-span-3">{{ t('server.backups.created') }}</span>
                <span class="col-span-2">{{ t('server.backups.storage') }}</span>
                <span class="col-span-1 text-right">{{ t('server.backups.status') }}</span>
              </div>
              <div class="divide-y divide-default">
                <div
                  v-for="i in 3"
                  :key="`skeleton-${i}`"
                  class="grid grid-cols-12 items-center gap-2 px-4 py-3"
                >
                  <div class="col-span-4 space-y-2">
                    <USkeleton class="h-4 w-32" />
                    <USkeleton class="h-3 w-48" />
                  </div>
                  <div class="col-span-2">
                    <USkeleton class="h-4 w-16" />
                  </div>
                  <div class="col-span-3">
                    <USkeleton class="h-4 w-40" />
                  </div>
                  <div class="col-span-2">
                    <USkeleton class="h-4 w-20" />
                  </div>
                  <div class="col-span-1">
                    <USkeleton class="h-5 w-16" />
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else-if="backups.length === 0"
              class="rounded-lg border border-dashed border-default p-8 text-center"
            >
              <UIcon name="i-lucide-archive" class="mx-auto size-12 text-muted-foreground/50" />
              <p class="mt-3 text-sm font-medium">{{ t('server.backups.noBackups') }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('server.backups.noBackupsDescription') }}
              </p>
            </div>

            <div v-else class="overflow-hidden rounded-lg border border-default">
              <div
                class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
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
                      <UIcon
                        v-if="backup.isLocked"
                        name="i-lucide-lock"
                        class="size-3 text-error"
                      />
                    </div>
                    <p class="text-xs text-muted-foreground">{{ backup.uuid }}</p>
                  </div>
                  <span class="col-span-2 text-sm text-muted-foreground">{{
                    formatBytes(backup.bytes)
                  }}</span>
                  <span class="col-span-3 text-sm text-muted-foreground">
                    <NuxtTime
                      v-if="backup.completedAt || backup.createdAt"
                      :datetime="backup.completedAt || backup.createdAt"
                      month="short"
                      day="numeric"
                      year="numeric"
                      hour="numeric"
                      minute="2-digit"
                      format="MMM d, yyyy • h:mm a"
                    />
                    <span v-else>{{ t('server.backups.inProgressEllipsis') }}</span>
                  </span>
                  <span class="col-span-2 text-sm text-muted-foreground">{{
                    getStorageLabel(backup.disk)
                  }}</span>
                  <div class="col-span-1">
                    <UBadge
                      :color="getBackupStatus(backup).color"
                      :variant="getBackupStatus(backup).variant"
                      size="xs"
                    >
                      {{ getBackupStatus(backup).label }}
                    </UBadge>
                  </div>
                  <div class="col-span-12 flex items-center justify-end gap-2">
                    <UButton
                      :icon="backup.isLocked ? 'i-lucide-unlock' : 'i-lucide-lock'"
                      size="xs"
                      variant="ghost"
                      :loading="operatingBackupId === backup.uuid"
                      @click="toggleLock(backup.uuid)"
                    >
                      {{ backup.isLocked ? t('server.backups.unlock') : t('server.backups.lock') }}
                    </UButton>
                    <UButton
                      icon="i-lucide-download"
                      size="xs"
                      variant="ghost"
                      color="primary"
                      :loading="operatingBackupId === backup.uuid"
                      :disabled="!backup.completedAt || !backup.isSuccessful"
                      @click="downloadBackup(backup.uuid)"
                    >
                      {{ t('server.backups.download') }}
                    </UButton>
                    <UButton
                      icon="i-lucide-rotate-ccw"
                      size="xs"
                      variant="ghost"
                      color="warning"
                      :loading="operatingBackupId === backup.uuid"
                      :disabled="!backup.completedAt || !backup.isSuccessful"
                      @click="openRestoreModal(backup)"
                    >
                      {{ t('server.backups.restore') }}
                    </UButton>
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      variant="ghost"
                      color="error"
                      :loading="operatingBackupId === backup.uuid"
                      :disabled="backup.isLocked"
                      @click="openDeleteModal(backup)"
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

    <UModal
      v-model:open="showDeleteModal"
      :title="t('server.backups.delete')"
      :description="t('server.backups.confirmDeleteDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('common.warning') }}</template>
            <template #description>
              {{ t('server.backups.confirmDeleteWarning') }}
            </template>
          </UAlert>
          <div v-if="backupToDelete" class="rounded-md bg-muted p-3 space-y-2">
            <p class="text-sm font-medium">{{ backupToDelete.name }}</p>
            <p class="text-xs text-muted-foreground">{{ backupToDelete.uuid }}</p>
            <p class="text-xs text-muted-foreground">
              {{ t('server.backups.size') }}: {{ formatBytes(backupToDelete.bytes) }}
            </p>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="operatingBackupId !== null"
          @click="
            () => {
              closeDeleteModal();
              close();
            }
          "
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="operatingBackupId !== null"
          :disabled="operatingBackupId !== null"
          @click="confirmDelete"
        >
          {{ t('server.backups.delete') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="showRestoreModal"
      :title="t('server.backups.restore')"
      :description="t('server.backups.confirmRestoreDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="warning" icon="i-lucide-alert-triangle">
            <template #title>{{ t('common.warning') }}</template>
            <template #description>
              {{ t('server.backups.confirmRestoreWarning') }}
            </template>
          </UAlert>
          <div v-if="backupToRestore" class="rounded-md bg-muted p-3 space-y-2">
            <p class="text-sm font-medium">{{ backupToRestore.name }}</p>
            <p class="text-xs text-muted-foreground">{{ backupToRestore.uuid }}</p>
            <p class="text-xs text-muted-foreground">
              {{ t('server.backups.size') }}: {{ formatBytes(backupToRestore.bytes) }}
            </p>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="operatingBackupId !== null"
          @click="
            () => {
              closeRestoreModal();
              close();
            }
          "
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="warning"
          :loading="operatingBackupId !== null"
          :disabled="operatingBackupId !== null"
          @click="confirmRestore"
        >
          {{ t('server.backups.restore') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
