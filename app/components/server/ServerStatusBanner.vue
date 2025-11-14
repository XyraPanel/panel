<script setup lang="ts">
defineProps<{
  isInstalling?: boolean
  isTransferring?: boolean
  isSuspended?: boolean
  isNodeUnderMaintenance?: boolean
}>()
</script>

<template>
  <div v-if="isNodeUnderMaintenance || isInstalling || isTransferring || isSuspended" class="mb-4">
    <UAlert
      v-if="isNodeUnderMaintenance"
      color="warning"
      icon="i-lucide-alert-triangle"
      title="Node Under Maintenance"
      description="The node of this server is currently under maintenance and all actions are unavailable."
    />
    <UAlert
      v-else-if="isInstalling"
      color="warning"
      icon="i-lucide-loader-2"
      title="Installation in Progress"
      description="This server is currently running its installation process and most actions are unavailable."
    />
    <UAlert
      v-else-if="isTransferring"
      color="warning"
      icon="i-lucide-arrow-right-left"
      title="Transfer in Progress"
      description="This server is currently being transferred to another node and all actions are unavailable."
    />
    <UAlert
      v-else-if="isSuspended"
      color="error"
      icon="i-lucide-ban"
      title="Server Suspended"
      description="This server has been suspended and is not accessible."
    />
  </div>
</template>
