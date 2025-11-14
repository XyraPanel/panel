<script setup lang="ts">
import type { ServerStatsChartProps } from '#shared/types/server-console'

const props = defineProps<ServerStatsChartProps>()

const cpuData = computed(() => {
  return props.history.map((entry, index) => ({
    time: index,
    cpu: entry.stats.cpuAbsolute,
  }))
})

const memoryData = computed(() => {
  return props.history.map((entry, index) => ({
    time: index,
    memory: (entry.stats.memoryBytes / entry.stats.memoryLimitBytes) * 100,
  }))
})

const networkData = computed(() => {
  return props.history.map((entry, index) => ({
    time: index,
    rx: entry.stats.networkRxBytes / 1024 / 1024,
    tx: entry.stats.networkTxBytes / 1024 / 1024,
  }))
})

const cpuCategories = {
  cpu: {
    name: 'CPU %',
    color: '#3b82f6',
  },
}

const memoryCategories = {
  memory: {
    name: 'Memory %',
    color: '#10b981',
  },
}

const networkCategories = {
  rx: {
    name: 'RX (MB)',
    color: '#8b5cf6',
  },
  tx: {
    name: 'TX (MB)',
    color: '#f59e0b',
  },
}

const xFormatter = (i: number): string => {
  const secondsAgo = props.history.length - i
  return secondsAgo === 0 ? 'Now' : `-${secondsAgo}s`
}
</script>

<template>
  <div v-if="history.length > 0" class="grid gap-4 md:grid-cols-3">

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">CPU Usage</span>
          <span v-if="stats" class="text-xs text-muted-foreground">
            {{ stats.cpuAbsolute.toFixed(1) }}%
          </span>
        </div>
      </template>

      <LineChart :data="cpuData" :categories="cpuCategories" :height="120" :x-formatter="xFormatter" :y-num-ticks="3"
        :grid-line-y="true" />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Memory Usage</span>
          <span v-if="stats" class="text-xs text-muted-foreground">
            {{ ((stats.memoryBytes / stats.memoryLimitBytes) * 100).toFixed(1) }}%
          </span>
        </div>
      </template>

      <LineChart :data="memoryData" :categories="memoryCategories" :height="120" :x-formatter="xFormatter"
        :y-num-ticks="3" :grid-line-y="true" />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Network I/O</span>
          <span v-if="stats" class="text-xs text-muted-foreground">
            ↓{{ (stats.networkRxBytes / 1024 / 1024).toFixed(2) }} MB
          </span>
        </div>
      </template>

      <LineChart :data="networkData" :categories="networkCategories" :height="120" :x-formatter="xFormatter"
        :y-num-ticks="3" :grid-line-y="true" />
    </UCard>
  </div>
</template>
