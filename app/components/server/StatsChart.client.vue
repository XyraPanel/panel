<script setup lang="ts">
import type { ServerStatsChartProps } from '#shared/types/server'

const { t } = useI18n()
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
    memory: Math.floor(entry.stats.memoryBytes / 1024 / 1024),
  }))
})

const networkData = computed(() => {
  return props.history.map((entry, index) => {
    if (index === 0) {
      return {
        time: index,
        rx: 0,
        tx: 0,
      }
    }
    
    const previous = props.history[index - 1]
    if (!previous) {
      return {
        time: index,
        rx: 0,
        tx: 0,
      }
    }
    const rxDelta = Math.max(0, entry.stats.networkRxBytes - previous.stats.networkRxBytes)
    const txDelta = Math.max(0, entry.stats.networkTxBytes - previous.stats.networkTxBytes)
    
    return {
      time: index,
      rx: rxDelta / 1024 / 1024,
      tx: txDelta / 1024 / 1024,
    }
  })
})

const diskData = computed(() => {
  return props.history.map((entry, index) => {
    if (index === 0) {
      return {
        time: index,
        read: 0,
        write: 0,
      }
    }
    
    const previous = props.history[index - 1]
    if (!previous) {
      return {
        time: index,
        read: 0,
        write: 0,
      }
    }
    const diskDelta = entry.stats.diskBytes - previous.stats.diskBytes
    
    return {
      time: index,
      read: diskDelta < 0 ? Math.abs(diskDelta) / 1024 / 1024 : 0,
      write: diskDelta > 0 ? diskDelta / 1024 / 1024 : 0,
    }
  })
})

const cpuCategories = computed(() => ({
  cpu: {
    name: t('server.stats.cpuPercent'),
    color: '#3b82f6',
  },
}))

const memoryCategories = computed(() => ({
  memory: {
    name: t('server.stats.memoryMB'),
    color: '#10b981',
  },
}))

const networkCategories = computed(() => ({
  rx: {
    name: t('server.stats.rxMBs'),
    color: '#8b5cf6',
  },
  tx: {
    name: t('server.stats.txMBs'),
    color: '#f59e0b',
  },
}))

const diskCategories = computed(() => ({
  read: {
    name: t('server.stats.readMBs'),
    color: '#10b981',
  },
  write: {
    name: t('server.stats.writeMBs'),
    color: '#ef4444',
  },
}))

const xFormatter = (i: number): string => {
  const secondsAgo = props.history.length - i
  return secondsAgo === 0 ? t('server.stats.now') : t('server.stats.secondsAgo', { seconds: secondsAgo })
}
</script>

<template>
  <div v-if="history.length > 0" class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">{{ t('server.stats.cpuUsage') }}</span>
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
          <span class="text-sm font-semibold">{{ t('server.stats.memoryUsage') }}</span>
          <span v-if="stats" class="text-xs text-muted-foreground">
            {{ Math.floor(stats.memoryBytes / 1024 / 1024) }} MB
          </span>
        </div>
      </template>

      <LineChart :data="memoryData" :categories="memoryCategories" :height="120" :x-formatter="xFormatter"
        :y-num-ticks="3" :grid-line-y="true" />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">{{ t('server.stats.networkIO') }}</span>
          <span v-if="stats && networkData.length > 1" class="text-xs text-muted-foreground">
            ↓{{ (networkData[networkData.length - 1]?.rx || 0).toFixed(2) }} MB/s
            ↑{{ (networkData[networkData.length - 1]?.tx || 0).toFixed(2) }} MB/s
          </span>
        </div>
      </template>

      <LineChart :data="networkData" :categories="networkCategories" :height="120" :x-formatter="xFormatter"
        :y-num-ticks="3" :grid-line-y="true" />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">{{ t('server.stats.diskIO') }}</span>
          <span v-if="stats && diskData.length > 1" class="text-xs text-muted-foreground">
            ↓{{ (diskData[diskData.length - 1]?.read || 0).toFixed(2) }} MB/s
            ↑{{ (diskData[diskData.length - 1]?.write || 0).toFixed(2) }} MB/s
          </span>
        </div>
      </template>

      <LineChart :data="diskData" :categories="diskCategories" :height="120" :x-formatter="xFormatter"
        :y-num-ticks="3" :grid-line-y="true" />
    </UCard>
  </div>
</template>
