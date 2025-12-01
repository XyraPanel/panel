<script setup lang="ts">
const { t } = useI18n()

defineProps<{
  server?: {
    uuid?: string
    node?: string
    allocation?: { ip: string; port: number }
    limits?: {
      memory?: number | null
      disk?: number | null
      cpu?: number | null
    }
  }
}>()

function formatLimit(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined) return t('common.unlimited')
  return `${value.toLocaleString()} ${suffix}`
}
</script>

<template>
  <UCard v-if="server">
    <template #header>
      <h3 class="text-sm font-semibold">{{ t('server.details.serverInformation') }}</h3>
    </template>

    <div class="space-y-3 text-sm">
      <div>
        <div class="text-xs text-muted-foreground">{{ t('server.details.serverId') }}</div>
        <div class="mt-1 font-mono text-xs">{{ server.uuid || t('common.na') }}</div>
      </div>

      <div v-if="server.allocation">
        <div class="text-xs text-muted-foreground">{{ t('server.details.address') }}</div>
        <div class="mt-1 font-mono text-xs">
          {{ server.allocation.ip }}:{{ server.allocation.port }}
        </div>
      </div>

      <div v-if="server.node">
        <div class="text-xs text-muted-foreground">{{ t('common.node') }}</div>
        <div class="mt-1">{{ server.node }}</div>
      </div>

      <div class="border-t border-default pt-3">
        <div class="text-xs font-medium text-muted-foreground mb-2">{{ t('server.details.resourceLimits') }}</div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('server.details.memory') }}</span>
            <span class="text-xs font-medium">{{ formatLimit(server.limits?.memory, 'MB') }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('server.details.disk') }}</span>
            <span class="text-xs font-medium">{{ formatLimit(server.limits?.disk, 'MB') }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('server.details.cpu') }}</span>
            <span class="text-xs font-medium">{{ formatLimit(server.limits?.cpu, '%') }}</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
