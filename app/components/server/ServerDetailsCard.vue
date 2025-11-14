<script setup lang="ts">
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
  if (value === null || value === undefined) return 'Unlimited'
  return `${value.toLocaleString()} ${suffix}`
}
</script>

<template>
  <UCard v-if="server">
    <template #header>
      <h3 class="text-sm font-semibold">Server Information</h3>
    </template>

    <div class="space-y-3 text-sm">
      <div>
        <div class="text-xs text-muted-foreground">Server ID</div>
        <div class="mt-1 font-mono text-xs">{{ server.uuid || 'N/A' }}</div>
      </div>

      <div v-if="server.allocation">
        <div class="text-xs text-muted-foreground">Address</div>
        <div class="mt-1 font-mono text-xs">
          {{ server.allocation.ip }}:{{ server.allocation.port }}
        </div>
      </div>

      <div v-if="server.node">
        <div class="text-xs text-muted-foreground">Node</div>
        <div class="mt-1">{{ server.node }}</div>
      </div>

      <div class="border-t border-default pt-3">
        <div class="text-xs font-medium text-muted-foreground mb-2">Resource Limits</div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Memory</span>
            <span class="text-xs font-medium">{{ formatLimit(server.limits?.memory, 'MB') }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Disk</span>
            <span class="text-xs font-medium">{{ formatLimit(server.limits?.disk, 'MB') }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">CPU</span>
            <span class="text-xs font-medium">{{ formatLimit(server.limits?.cpu, '%') }}</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
