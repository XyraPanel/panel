<script setup lang="ts">
import type { WingsSystemInformation } from '#shared/types/wings';

const props = defineProps<{
  nodeId: string;
}>();

const rawFetch = $fetch as (input: string, init?: Record<string, unknown>) => Promise<unknown>;

async function fetchSystemInfo(nodeId: string): Promise<WingsSystemInformation | null> {
  const endpoint: string = `/api/admin/wings/nodes/${nodeId}/system`;
  const result = await rawFetch(endpoint);
  const response = result as { data: WingsSystemInformation };
  return response.data;
}

const {
  data: systemData,
  pending: systemPending,
  error,
} = await useAsyncData<WingsSystemInformation | null>(
  `node-system-${props.nodeId}`,
  () => fetchSystemInfo(props.nodeId),
  {
    default: () => null,
    watch: [() => props.nodeId],
  },
);

const systemInfo = computed(() => systemData.value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

const systemMetrics = computed(() => {
  const system = systemInfo.value;
  if (!isRecord(system)) return [];

  const metrics: { label: string; value: string; icon: string }[] = [];

  const wingsVersion = system.version;
  if (typeof wingsVersion === 'string' && wingsVersion.length > 0) {
    metrics.push({ label: 'Wings Version', value: wingsVersion, icon: 'i-lucide-package' });
  }

  const systemBlock = isRecord(system.system) ? system.system : {};

  const cpuThreads = systemBlock.cpu_threads;
  if (typeof cpuThreads === 'number') {
    metrics.push({ label: 'CPU Threads', value: String(cpuThreads), icon: 'i-lucide-cpu' });
  }

  const memoryBytes = systemBlock.memory_bytes;
  if (typeof memoryBytes === 'number') {
    metrics.push({
      label: 'Physical Memory',
      value: formatBytes(memoryBytes),
      icon: 'i-lucide-memory-stick',
    });
  }

  const kernelVersion = systemBlock.kernel_version;
  if (typeof kernelVersion === 'string') {
    metrics.push({ label: 'Kernel Version', value: kernelVersion, icon: 'i-lucide-terminal' });
  }

  const osLabel = systemBlock.os;
  if (typeof osLabel === 'string') {
    metrics.push({ label: 'Operating System', value: osLabel, icon: 'i-lucide-monitor' });
  }

  const architecture = systemBlock.architecture;
  if (typeof architecture === 'string') {
    metrics.push({ label: 'Architecture', value: architecture, icon: 'i-lucide-cpu' });
  }

  const dockerBlock = isRecord(system.docker) ? system.docker : {};

  const dockerVersion = dockerBlock.version;
  if (typeof dockerVersion === 'string') {
    metrics.push({ label: 'Docker Version', value: dockerVersion, icon: 'i-lucide-container' });
  }

  const dockerStorage = isRecord(dockerBlock.storage) ? dockerBlock.storage : {};
  const storageDriver = dockerStorage.driver;
  if (typeof storageDriver === 'string') {
    metrics.push({ label: 'Storage Driver', value: storageDriver, icon: 'i-lucide-hard-drive' });
  }

  const storagePath = dockerStorage.path;
  if (typeof storagePath === 'string') {
    metrics.push({ label: 'Docker Root', value: storagePath, icon: 'i-lucide-folder' });
  }

  return metrics;
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted-foreground">
        Real-time system information from the Wings daemon
      </p>
    </div>

    <div v-if="systemPending" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="i in 3" :key="`node-system-skeleton-${i}`" class="space-y-3">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-3 w-2/3" />
      </UCard>
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
      <template #title>Unable to fetch system information</template>
      <template #description>
        {{ (error as Error).message }}
      </template>
    </UAlert>

    <div
      v-else-if="systemMetrics.length === 0"
      class="rounded-lg border border-default p-8 text-center"
    >
      <UIcon name="i-lucide-activity" class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-2 text-sm text-muted-foreground">No system information available</p>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="metric in systemMetrics"
        :key="metric.label"
        class="flex items-start gap-3 rounded-lg border border-default p-4"
      >
        <div class="p-2 text-primary">
          <UIcon :name="metric.icon" class="size-5" />
        </div>
        <div class="flex-1 space-y-1">
          <div class="text-xs text-muted-foreground">{{ metric.label }}</div>
          <div class="text-sm font-medium">{{ metric.value }}</div>
        </div>
      </div>
    </div>

    <UCard v-if="systemInfo" :ui="{ body: 'space-y-2' }">
      <template #header>
        <h3 class="text-sm font-semibold">Raw System Data</h3>
      </template>
      <div class="rounded-lg bg-muted/30 p-4">
        <pre
          class="overflow-x-auto text-xs"
        ><code>{{ JSON.stringify(systemInfo, null, 2) }}</code></pre>
      </div>
    </UCard>
  </div>
</template>
