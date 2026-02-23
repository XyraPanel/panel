{ code: 'es', name: 'Español', language: 'es', dir: 'ltr', file: 'es.json' },
<script setup lang="ts">
const { t } = useI18n();

defineProps<{
  isInstalling?: boolean;
  isTransferring?: boolean;
  isSuspended?: boolean;
  isNodeUnderMaintenance?: boolean;
}>();
</script>

<template>
  <div v-if="isNodeUnderMaintenance || isInstalling || isTransferring || isSuspended" class="mb-4">
    <UAlert
      v-if="isNodeUnderMaintenance"
      color="warning"
      icon="i-lucide-alert-triangle"
      :title="t('server.status.nodeUnderMaintenance')"
      :description="t('server.status.nodeUnderMaintenanceDescription')"
    />
    <UAlert
      v-else-if="isInstalling"
      color="warning"
      icon="i-lucide-loader-2"
      :title="t('server.status.installationInProgress')"
      :description="t('server.status.installationInProgressDescription')"
    />
    <UAlert
      v-else-if="isTransferring"
      color="warning"
      icon="i-lucide-arrow-right-left"
      :title="t('server.status.transferInProgress')"
      :description="t('server.status.transferInProgressDescription')"
    />
    <UAlert
      v-else-if="isSuspended"
      color="error"
      icon="i-lucide-ban"
      :title="t('server.status.serverSuspended')"
      :description="t('server.status.serverSuspendedDescription')"
    />
  </div>
</template>
