<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';

import type {
  AdminPaginatedMeta,
  AdminWingsNodeAllocationSummary,
  AdminWingsNodeAllocationsPayload,
  AdminWingsNodeDetail,
  AdminWingsNodeServerSummary,
  AdminWingsNodeServersPayload,
} from '#shared/types/admin';

const route = useRoute();
const requestFetch = useRequestFetch();

definePageMeta({
  auth: true,
  adminTitle: 'Node details',
  adminSubtitle: 'Inspect Wings node metrics and allocations',
});

const nodeId = computed(() => route.params.id as string);

const maintenanceActions = computed(() => [
  {
    label: t('admin.nodes.maintenanceActions.syncNode'),
    icon: 'i-lucide-refresh-ccw',
    action: 'sync',
  },
  {
    label: t('admin.nodes.maintenanceActions.rotateTokens'),
    icon: 'i-lucide-key-round',
    action: 'rotate',
  },
  {
    label: t('admin.nodes.maintenanceActions.transferServers'),
    icon: 'i-lucide-truck',
    action: 'transfer',
  },
]);

const actionLoading = ref<string | null>(null);
const showTransferModal = ref(false);
const showCreateAllocationModal = ref(false);
const transferForm = reactive({
  targetNodeId: '',
  serverIds: [] as string[],
});
const createAllocationForm = reactive({
  ip: '',
  ports: [] as string[],
  ipAlias: '',
});
const isCreatingAllocations = ref(false);

const { data: availableNodes } = await useAsyncData(
  'available-nodes',
  () => requestFetch<{ data: Array<{ id: string; name: string }> }>('/api/wings/nodes'),
  { default: () => ({ data: [] }) },
);

const nodeOptions = computed(() => {
  return (availableNodes.value?.data ?? [])
    .filter((n) => n.id !== nodeId.value)
    .map((n) => ({ label: n.name, value: n.id }));
});

const tab = ref<'overview' | 'servers' | 'allocations' | 'settings' | 'configuration' | 'system'>(
  'overview',
);

const toast = useToast();
const { t } = useI18n();

const serverQuery = reactive({ page: 1, perPage: 25, search: '' });
const allocationQuery = reactive({ page: 1, perPage: 25, search: '' });

const {
  data: nodeResponse,
  pending,
  error,
  refresh: refreshNode,
} = await useAsyncData(
  () => `admin-node-${nodeId.value}`,
  () => requestFetch<{ data: AdminWingsNodeDetail }>(`/api/admin/wings/nodes/${nodeId.value}`),
  { watch: [nodeId] },
);

const nodeDetail = computed(() => nodeResponse.value?.data);
const node = computed(() => nodeDetail.value?.node);
const stats = computed(() => nodeDetail.value?.stats);
const systemInfo = computed(() => nodeDetail.value?.system ?? null);
const systemError = computed(() => nodeDetail.value?.systemError ?? null);

const serverTable = await useAsyncData(
  () =>
    `admin-node-${nodeId.value}-servers-${serverQuery.page}-${serverQuery.perPage}-${serverQuery.search}`,
  () =>
    requestFetch<AdminWingsNodeServersPayload>(`/api/admin/wings/nodes/${nodeId.value}/servers`, {
      query: {
        page: serverQuery.page,
        perPage: serverQuery.perPage,
        search: serverQuery.search || undefined,
      },
    }),
  { immediate: false },
);

const allocationTable = await useAsyncData(
  () =>
    `admin-node-${nodeId.value}-allocations-${allocationQuery.page}-${allocationQuery.perPage}-${allocationQuery.search}`,
  () =>
    requestFetch<AdminWingsNodeAllocationsPayload>(
      `/api/admin/wings/nodes/${nodeId.value}/allocations`,
      {
        query: {
          page: allocationQuery.page,
          perPage: allocationQuery.perPage,
          search: allocationQuery.search || undefined,
        },
      },
    ),
  { immediate: false },
);

const statusBadge = computed(() => {
  if (stats.value?.maintenanceMode) {
    return { label: t('admin.nodes.maintenance'), color: 'warning' as const };
  }

  if (node.value && !node.value.public) {
    return { label: t('admin.nodes.offline'), color: 'error' as const };
  }

  return { label: t('admin.nodes.online'), color: 'success' as const };
});

function formatMegabytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 MiB';
  }

  const units = ['MiB', 'GiB', 'TiB', 'PiB'];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const precision = current >= 10 ? 0 : 1;
  return `${current.toFixed(precision)} ${units[unitIndex]}`;
}

function formatUsage(used?: number | null, total?: number | null) {
  return `${formatMegabytes(used)} / ${formatMegabytes(total)}`;
}

const resourceUsage = computed(() => {
  const nodeRecord = node.value;
  const statsRecord = stats.value;

  return {
    memory: {
      used: statsRecord?.memoryProvisioned ?? 0,
      total: nodeRecord?.memory ?? 0,
    },
    disk: {
      used: statsRecord?.diskProvisioned ?? 0,
      total: nodeRecord?.disk ?? 0,
    },
  };
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const systemMetrics = computed(() => {
  const system = systemInfo.value;
  if (!isRecord(system)) {
    return [] as { label: string; value: string }[];
  }

  const metrics: { label: string; value: string }[] = [];
  const wingsVersion = system.version;
  if (typeof wingsVersion === 'string' && wingsVersion.length > 0) {
    metrics.push({ label: 'Wings version', value: wingsVersion });
  }

  const systemBlock = isRecord(system.system) ? system.system : {};
  const cpuThreads = systemBlock.cpu_threads;
  if (typeof cpuThreads === 'number') {
    metrics.push({ label: 'CPU threads', value: String(cpuThreads) });
  }
  const memoryBytes = systemBlock.memory_bytes;
  if (typeof memoryBytes === 'number') {
    metrics.push({
      label: 'Memory (physical)',
      value: formatMegabytes(memoryBytes / (1024 * 1024)),
    });
  }
  const kernelVersion = systemBlock.kernel_version;
  if (typeof kernelVersion === 'string') {
    metrics.push({ label: 'Kernel', value: kernelVersion });
  }
  const osLabel = systemBlock.os;
  if (typeof osLabel === 'string') {
    metrics.push({ label: 'OS', value: osLabel });
  }

  const dockerBlock = isRecord(system.docker) ? system.docker : {};
  const dockerVersion = dockerBlock.version;
  if (typeof dockerVersion === 'string') {
    metrics.push({ label: 'Docker', value: dockerVersion });
  }
  const dockerStorage = isRecord(dockerBlock.storage) ? dockerBlock.storage : {};
  const storageDriver = dockerStorage.driver;
  if (typeof storageDriver === 'string') {
    metrics.push({ label: 'Storage driver', value: storageDriver });
  }

  return metrics;
});

const serverRows = computed<AdminWingsNodeServerSummary[]>(
  () => serverTable.data.value?.data ?? [],
);
const serverPagination = computed<AdminPaginatedMeta | undefined>(
  () => serverTable.data.value?.pagination,
);
const allocationRows = computed<AdminWingsNodeAllocationSummary[]>(
  () => allocationTable.data.value?.data ?? [],
);
const allocationPagination = computed<AdminPaginatedMeta | undefined>(
  () => allocationTable.data.value?.pagination,
);

watch(tab, async (value) => {
  if (value === 'servers' && !serverTable.data.value) {
    await serverTable.refresh();
  }
  if (value === 'allocations' && !allocationTable.data.value) {
    await allocationTable.execute();
  }
});

watch([() => serverQuery.page, () => serverQuery.perPage], async () => {
  if (tab.value !== 'servers') return;
  await serverTable.refresh();
});

watchDebounced(
  () => serverQuery.search,
  async () => {
    serverQuery.page = 1;
    if (tab.value !== 'servers') return;
    await serverTable.refresh();
  },
  { debounce: 300, maxWait: 1000 },
);

watch([() => allocationQuery.page, () => allocationQuery.perPage], async () => {
  if (tab.value !== 'allocations') return;
  await allocationTable.refresh();
});

watchDebounced(
  () => allocationQuery.search,
  async () => {
    allocationQuery.page = 1;
    if (tab.value !== 'allocations') return;
    await allocationTable.refresh();
  },
  { debounce: 300, maxWait: 1000 },
);

async function handleMaintenanceAction(action: string) {
  if (!node.value) return;

  actionLoading.value = action;

  try {
    switch (action) {
      case 'sync': {
        const response = await $fetch<{ success: boolean; connected: boolean; message: string }>(
          `/api/admin/nodes/${nodeId.value}/test-connection`,
          { method: 'POST' },
        );

        if (response.connected) {
          toast.add({
            title: t('admin.nodes.nodeSynced'),
            description: t('admin.nodes.nodeSyncedDescription'),
            color: 'success',
          });
          await refreshNode();
        } else {
          toast.add({
            title: t('admin.nodes.syncFailed'),
            description: response.message || t('admin.nodes.failedToConnectToWings'),
            color: 'error',
          });
        }
        break;
      }
      case 'rotate': {
        if (!confirm(t('admin.nodes.confirmRotateTokens'))) {
          return;
        }

        await $fetch(`/api/admin/wings/nodes/${nodeId.value}/token`, {
          method: 'POST',
        });

        toast.add({
          title: t('admin.nodes.tokensRotated'),
          description: t('admin.nodes.tokensRotatedDescription'),
          color: 'success',
        });
        await refreshNode();
        break;
      }
      case 'transfer': {
        showTransferModal.value = true;
        break;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('admin.nodes.failedToActionNode', { action });
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    actionLoading.value = null;
  }
}

function setTransferServerChecked(serverId: string, value: boolean | 'indeterminate') {
  const checked = value === true;

  if (checked) {
    if (!transferForm.serverIds.includes(serverId)) transferForm.serverIds.push(serverId);
  } else {
    transferForm.serverIds = transferForm.serverIds.filter((id) => id !== serverId);
  }
}

function handleViewServer(row: AdminWingsNodeServerSummary) {
  navigateTo(`/admin/servers/${row.id}`);
}

function handleUnlinkServer(row: AdminWingsNodeServerSummary) {
  transferForm.serverIds = [row.id];
  transferForm.targetNodeId = '';
  showTransferModal.value = true;
}

async function togglePrimaryAllocation(row: AdminWingsNodeAllocationSummary) {
  if (!row.serverId) {
    toast.add({
      title: t('common.error'),
      description: t('admin.nodes.cannotSetPrimaryForUnassigned'),
      color: 'error',
    });
    return;
  }

  const action = row.isPrimary ? 'demote' : 'promote';
  if (!confirm(t('admin.nodes.confirmAllocationAction', { action, ip: row.ip, port: row.port }))) {
    return;
  }

  try {
    await $fetch(`/api/client/servers/${row.serverId}/network/allocations/${row.id}/primary`, {
      method: 'POST',
    });

    toast.add({
      title: row.isPrimary
        ? t('admin.nodes.allocationDemoted')
        : t('admin.nodes.allocationPromoted'),
      description: t('admin.nodes.allocationStatusChanged', {
        ip: row.ip,
        port: row.port,
        status: row.isPrimary ? t('admin.nodes.secondary') : t('admin.nodes.primary'),
      }),
      color: 'success',
    });

    await allocationTable.refresh();
    await refreshNode();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('admin.nodes.failedToUpdateAllocation');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  }
}

function handleTransferAllocation(row: AdminWingsNodeAllocationSummary) {
  if (!row.serverId) {
    toast.add({
      title: t('common.error'),
      description: t('admin.nodes.cannotTransferUnassignedAllocation'),
      color: 'error',
    });
    return;
  }

  navigateTo(`/admin/servers/${row.serverId}`);
}

async function handleDeleteAllocation(row: AdminWingsNodeAllocationSummary) {
  if (row.serverId) {
    toast.add({
      title: t('admin.nodes.cannotDelete'),
      description: t('admin.nodes.cannotDeleteAssignedAllocation'),
      color: 'error',
    });
    return;
  }

  if (!confirm(t('admin.nodes.confirmDeleteAllocation', { ip: row.ip, port: row.port }))) {
    return;
  }

  try {
    await $fetch(`/api/admin/allocations/${row.id}`, {
      method: 'DELETE',
    });

    toast.add({
      title: t('admin.nodes.allocationDeleted'),
      description: t('admin.nodes.allocationDeletedDescription', { ip: row.ip, port: row.port }),
      color: 'success',
    });

    if (allocationQuery.page > 1) {
      allocationQuery.page = 1;
    }
    await allocationTable.refresh();
    await refreshNode();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('admin.nodes.failedToDeleteAllocation');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  }
}

async function handleTransferServers() {
  if (!transferForm.targetNodeId || transferForm.serverIds.length === 0) {
    return;
  }

  actionLoading.value = 'transfer';
  try {
    const transferPromises = transferForm.serverIds.map((serverId) =>
      $fetch(`/api/admin/servers/${serverId}/transfer`, {
        method: 'POST',
        body: {
          nodeId: transferForm.targetNodeId,
        },
      }),
    );

    await Promise.all(transferPromises);

    toast.add({
      title: t('admin.nodes.transferInitiated'),
      description: t('admin.nodes.transferringServers', { count: transferForm.serverIds.length }),
      color: 'success',
    });

    showTransferModal.value = false;
    transferForm.targetNodeId = '';
    transferForm.serverIds = [];

    await serverTable.refresh();
    await refreshNode();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('admin.nodes.failedToInitiateTransfer');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    actionLoading.value = null;
  }
}

function parsePorts(portTags: string[]): number[] {
  const ports: number[] = [];

  for (const tag of portTags) {
    const segment = tag.trim();
    if (!segment) continue;

    if (segment.includes('-')) {
      const [startRaw, endRaw] = segment.split('-', 2);
      const start = Number.parseInt(startRaw!, 10);
      const end = Number.parseInt(endRaw!, 10);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 1024 ||
        end > 65535 ||
        start > end
      ) {
        throw new Error(t('admin.nodes.portRangeInvalid'));
      }
      for (let port = start; port <= end; port++) {
        ports.push(port);
      }
    } else {
      const port = Number.parseInt(segment, 10);
      if (!Number.isFinite(port) || port < 1024 || port > 65535) {
        throw new Error(t('admin.nodes.portsMustBeInRange'));
      }
      ports.push(port);
    }
  }

  if (ports.length > 1000) {
    throw new Error(t('admin.nodes.portRangeExceeded'));
  }

  return ports;
}

async function handleCreateAllocations() {
  if (isCreatingAllocations.value) return;

  if (!createAllocationForm.ip || !createAllocationForm.ports) {
    toast.add({
      title: t('common.error'),
      description: t('admin.nodes.ipAndPortsRequired'),
      color: 'error',
    });
    return;
  }

  isCreatingAllocations.value = true;

  try {
    const ports = parsePorts(createAllocationForm.ports);
    const isCidr = createAllocationForm.ip.includes('/');
    const estimatedCount = isCidr
      ? Math.pow(2, 32 - Number.parseInt(createAllocationForm.ip.split('/')[1]!, 10)) * ports.length
      : ports.length;

    if (estimatedCount > 10000) {
      const formattedCount = new Intl.NumberFormat().format(estimatedCount);
      if (!confirm(t('admin.nodes.confirmCreateManyAllocations', { count: formattedCount }))) {
        isCreatingAllocations.value = false;
        return;
      }
    }

    await $fetch(`/api/admin/nodes/${nodeId.value}/allocations`, {
      method: 'POST',
      body: {
        ip: createAllocationForm.ip,
        ports,
        ipAlias: createAllocationForm.ipAlias || undefined,
      },
    });

    toast.add({
      title: t('admin.nodes.allocationsCreated'),
      description: t('admin.nodes.allocationsCreatedDescription', {
        ip: createAllocationForm.ip,
        count: ports.length,
      }),
      color: 'success',
    });

    showCreateAllocationModal.value = false;
    Object.assign(createAllocationForm, { ip: '', ports: '', ipAlias: '' });

    await allocationTable.refresh();
    await refreshNode();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description:
        err.data?.message ||
        (error instanceof Error ? error.message : t('admin.nodes.failedToCreateAllocations')),
      color: 'error',
    });
  } finally {
    isCreatingAllocations.value = false;
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <section class="space-y-6">
        <div v-if="pending" class="space-y-4">
          <USkeleton class="h-8 w-3/4" />
          <USkeleton class="h-32" />
          <div class="grid gap-4 lg:grid-cols-3">
            <USkeleton class="h-40" repeat="3" />
          </div>
        </div>
        <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
          <template #title>{{ t('admin.nodes.unableToLoadNodeDetails') }}</template>
          <template #description>{{ (error as Error).message }}</template>
        </UAlert>
        <template v-else>
          <header class="flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-1">
              <p class="text-xs text-muted-foreground">{{ t('admin.nodes.node') }} {{ nodeId }}</p>
              <h1 class="text-xl font-semibold">
                {{ node?.name ?? t('admin.nodes.unknownNode') }}
              </h1>
              <p class="text-xs text-muted-foreground">
                {{ node?.fqdn }} ·
                {{
                  node?.scheme?.toUpperCase() === 'HTTPS'
                    ? t('admin.nodes.tls')
                    : t('admin.nodes.http')
                }}
                {{ t('admin.nodes.endpoint') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="statusBadge.color" variant="subtle" size="sm">{{
                statusBadge.label
              }}</UBadge>
              <UButton
                v-for="action in maintenanceActions"
                :key="action.label"
                :icon="action.icon"
                :loading="actionLoading === action.action"
                :disabled="actionLoading !== null"
                color="neutral"
                variant="ghost"
                @click="handleMaintenanceAction(action.action)"
              >
                {{ action.label }}
              </UButton>
            </div>
          </header>

          <UTabs
            v-model="tab"
            variant="link"
            :items="[
              {
                label: t('admin.nodes.tabs.overview'),
                value: 'overview',
                icon: 'i-lucide-layout-dashboard',
              },
              { label: t('admin.nodes.tabs.servers'), value: 'servers', icon: 'i-lucide-server' },
              {
                label: t('admin.nodes.tabs.allocations'),
                value: 'allocations',
                icon: 'i-lucide-network',
              },
              {
                label: t('admin.nodes.tabs.settings'),
                value: 'settings',
                icon: 'i-lucide-settings',
              },
              {
                label: t('admin.nodes.tabs.configuration'),
                value: 'configuration',
                icon: 'i-lucide-file-code',
              },
              { label: t('admin.nodes.tabs.system'), value: 'system', icon: 'i-lucide-activity' },
            ]"
            class="w-full"
          />

          <div v-if="tab === 'overview'" class="grid gap-4 lg:grid-cols-2">
            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('common.status') }}</h2>
              </template>
              <div class="space-y-3">
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{{ t('admin.nodes.tabs.servers') }}</span>
                  <span>{{ stats?.serversTotal ?? 0 }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{{ t('admin.nodes.tabs.allocations') }}</span>
                  <span>{{ stats?.allocationsTotal ?? 0 }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{{ t('admin.nodes.memoryUsage') }}</span>
                  <span>{{
                    formatUsage(resourceUsage.memory.used, resourceUsage.memory.total)
                  }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{{ t('admin.nodes.diskUsage') }}</span>
                  <span>{{ formatUsage(resourceUsage.disk.used, resourceUsage.disk.total) }}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ t('admin.nodes.lastSeen') }}</span>
                  <NuxtTime v-if="stats?.lastSeenAt" :datetime="stats.lastSeenAt" />
                  <span v-else>{{ t('common.unknown') }}</span>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.nodes.systemSnapshot') }}</h2>
              </template>
              <div class="space-y-3">
                <UAlert v-if="systemError" color="warning" icon="i-lucide-alert-triangle" size="sm">
                  <template #title>{{ t('admin.nodes.unableToContactWingsNode') }}</template>
                  <template #description>{{ systemError }}</template>
                </UAlert>
                <div v-else-if="systemMetrics.length === 0" class="text-xs text-muted-foreground">
                  {{ t('admin.nodes.noSystemDataReturned') }}
                </div>
                <ul v-else class="space-y-2">
                  <li
                    v-for="metric in systemMetrics"
                    :key="metric.label"
                    class="flex items-center justify-between text-sm text-muted-foreground"
                  >
                    <span class="font-medium text-foreground">{{ metric.label }}</span>
                    <span>{{ metric.value }}</span>
                  </li>
                </ul>
              </div>
            </UCard>
          </div>

          <UCard v-else-if="tab === 'servers'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">{{ t('admin.nodes.tabs.servers') }}</h2>
                <div class="flex flex-wrap items-center gap-2">
                  <UInput
                    v-model="serverQuery.search"
                    icon="i-lucide-search"
                    :placeholder="t('admin.nodes.searchNameOrIdentifier')"
                    size="sm"
                  />
                  <USelect
                    v-model="serverQuery.perPage"
                    :options="[
                      { label: t('common.perPage', { count: 25 }), value: 25 },
                      { label: t('common.perPage', { count: 50 }), value: 50 },
                      { label: t('common.perPage', { count: 100 }), value: 100 },
                    ]"
                    size="sm"
                  />
                </div>
              </div>
            </template>
            <div class="overflow-hidden rounded-md border border-default">
              <table class="min-w-full divide-y divide-default text-sm">
                <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 text-left">{{ t('common.name') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('admin.nodes.identifier') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('server.network.primaryAllocation') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('common.created') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('common.updated') }}</th>
                    <th class="px-3 py-2 text-right">{{ t('common.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-if="serverTable.pending.value"
                    class="text-center text-sm text-muted-foreground"
                  >
                    <td colspan="6" class="px-3 py-6">{{ t('admin.nodes.loadingServers') }}</td>
                  </tr>
                  <tr
                    v-else-if="serverRows.length === 0"
                    class="text-center text-sm text-muted-foreground"
                  >
                    <td colspan="6" class="px-3 py-6">{{ t('admin.nodes.noServersFound') }}</td>
                  </tr>
                  <tr
                    v-for="server in serverRows"
                    :key="server.id"
                    class="border-b border-default text-sm even:bg-muted/20"
                  >
                    <td class="px-3 py-2">
                      <div class="flex flex-col">
                        <NuxtLink
                          :to="`/admin/servers/${server.id}`"
                          class="font-medium text-primary hover:underline"
                        >
                          {{ server.name }}
                        </NuxtLink>
                        <span class="text-xs text-muted-foreground">{{ server.uuid }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      <code>{{ server.identifier }}</code>
                    </td>
                    <td class="px-3 py-2">
                      <span v-if="server.primaryAllocation"
                        >{{ server.primaryAllocation.ip }}:{{ server.primaryAllocation.port }}</span
                      >
                      <span v-else class="text-muted-foreground">N/A</span>
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      <NuxtTime v-if="server.createdAt" :datetime="server.createdAt" />
                      <span v-else>{{ t('common.unknown') }}</span>
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      <NuxtTime v-if="server.updatedAt" :datetime="server.updatedAt" />
                      <span v-else>{{ t('common.unknown') }}</span>
                    </td>
                    <td class="px-3 py-2 text-right">
                      <UDropdownMenu
                        :items="[
                          {
                            label: t('admin.nodes.viewDetails'),
                            icon: 'i-lucide-external-link',
                            click: () => handleViewServer(server),
                          },
                          {
                            label: t('admin.nodes.unlinkFromNode'),
                            icon: 'i-lucide-unlink',
                            color: 'warning',
                            click: () => handleUnlinkServer(server),
                          },
                        ]"
                      >
                        <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
                      </UDropdownMenu>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UPagination
              v-if="serverPagination"
              v-model:page="serverQuery.page"
              :page-count="Math.ceil(serverPagination.total / serverPagination.perPage)"
              :total="serverPagination.total"
              size="sm"
            />
          </UCard>

          <UCard v-else-if="tab === 'allocations'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">{{ t('admin.nodes.tabs.allocations') }}</h2>
                <div class="flex flex-wrap items-center gap-2">
                  <UInput
                    v-model="allocationQuery.search"
                    icon="i-lucide-search"
                    :placeholder="t('admin.nodes.filterByIpOrPort')"
                    size="sm"
                  />
                  <USelect
                    v-model="allocationQuery.perPage"
                    :options="[
                      { label: t('common.perPage', { count: 25 }), value: 25 },
                      { label: t('common.perPage', { count: 50 }), value: 50 },
                      { label: t('common.perPage', { count: 100 }), value: 100 },
                    ]"
                    size="sm"
                  />
                  <UButton
                    icon="i-lucide-plus"
                    color="primary"
                    variant="subtle"
                    size="sm"
                    @click="showCreateAllocationModal = true"
                  >
                    {{ t('admin.nodes.createAllocations') }}
                  </UButton>
                </div>
              </div>
            </template>
            <div class="overflow-hidden rounded-md border border-default">
              <table class="min-w-full divide-y divide-default text-sm">
                <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 text-left">{{ t('admin.nodes.ip') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('admin.nodes.allocations.ipAlias') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('admin.nodes.port') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('common.status') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('common.server') }}</th>
                    <th class="px-3 py-2 text-left">{{ t('admin.nodes.identifier') }}</th>
                    <th class="px-3 py-2 text-right">{{ t('common.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-if="allocationTable.pending.value"
                    class="text-center text-sm text-muted-foreground"
                  >
                    <td colspan="7" class="px-3 py-6">{{ t('admin.nodes.loadingAllocations') }}</td>
                  </tr>
                  <tr
                    v-else-if="allocationRows.length === 0"
                    class="text-center text-sm text-muted-foreground"
                  >
                    <td colspan="7" class="px-3 py-6">{{ t('admin.nodes.noAllocationsFound') }}</td>
                  </tr>
                  <tr
                    v-for="allocation in allocationRows"
                    :key="allocation.id"
                    class="border-b border-default text-sm even:bg-muted/20"
                  >
                    <td class="px-3 py-2 font-mono text-xs">{{ allocation.ip }}</td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      {{ allocation.ipAlias || '—' }}
                    </td>
                    <td class="px-3 py-2 font-mono text-xs">{{ allocation.port }}</td>
                    <td class="px-3 py-2">
                      <UBadge
                        :color="
                          !allocation.serverId
                            ? 'success'
                            : allocation.isPrimary
                              ? 'primary'
                              : 'neutral'
                        "
                        variant="outline"
                        size="xs"
                      >
                        {{
                          !allocation.serverId
                            ? t('admin.nodes.allocations.available')
                            : allocation.isPrimary
                              ? t('admin.nodes.primary')
                              : t('admin.nodes.allocations.additional')
                        }}
                      </UBadge>
                    </td>
                    <td class="px-3 py-2">{{ allocation.serverName || 'N/A' }}</td>
                    <td class="px-3 py-2 font-mono text-xs">
                      {{ allocation.serverIdentifier || '—' }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      <UDropdownMenu
                        :items="[
                          {
                            label: allocation.isPrimary
                              ? t('admin.nodes.markAsSecondary')
                              : t('admin.nodes.markAsPrimary'),
                            icon: 'i-lucide-badge-check',
                            click: () => togglePrimaryAllocation(allocation),
                          },
                          {
                            label: t('admin.nodes.transferToAnotherNode'),
                            icon: 'i-lucide-send-horizontal',
                            click: () => handleTransferAllocation(allocation),
                          },
                          {
                            label: t('admin.nodes.deleteAllocation'),
                            icon: 'i-lucide-trash-2',
                            color: 'error',
                            click: () => handleDeleteAllocation(allocation),
                          },
                        ]"
                      >
                        <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
                      </UDropdownMenu>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UPagination
              v-if="allocationPagination"
              v-model:page="allocationQuery.page"
              :page-count="Math.ceil(allocationPagination.total / allocationPagination.perPage)"
              :total="allocationPagination.total"
              size="sm"
            />
          </UCard>

          <UCard v-else-if="tab === 'settings'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <h2 class="text-lg font-semibold">{{ t('admin.nodes.tabs.settings') }}</h2>
            </template>
            <AdminNodeSettings v-if="node" :node="node" />
          </UCard>

          <UCard v-else-if="tab === 'configuration'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <h2 class="text-lg font-semibold">{{ t('admin.nodes.autoDeployConfiguration') }}</h2>
            </template>
            <AdminNodeConfiguration v-if="node" :node-id="node.id" />
          </UCard>

          <UCard v-else-if="tab === 'system'" :ui="{ body: 'space-y-4' }">
            <template #header>
              <h2 class="text-lg font-semibold">{{ t('admin.nodes.systemInformation') }}</h2>
            </template>
            <AdminNodeSystem v-if="node" :node-id="node.id" />
          </UCard>
        </template>
      </section>
    </UPageBody>

    <UModal
      v-model:open="showTransferModal"
      :title="t('admin.nodes.transferServers')"
      :description="t('admin.nodes.transferServersDescription')"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert icon="i-lucide-info">
            <template #title>{{ t('admin.nodes.serverTransfer') }}</template>
            <template #description>
              {{ t('admin.nodes.serverTransferDescription') }}
            </template>
          </UAlert>
          <UFormField
            :label="t('admin.servers.manage.targetNodeLabel')"
            name="targetNodeId"
            required
          >
            <USelect
              v-model="transferForm.targetNodeId"
              :options="nodeOptions"
              :placeholder="t('admin.nodes.selectTargetNode')"
              searchable
            />
            <template #help>
              {{ t('admin.nodes.chooseNodeToTransferServersTo') }}
            </template>
          </UFormField>
          <UFormField :label="t('admin.nodes.serversToTransfer')" name="serverIds">
            <div class="space-y-2">
              <div v-for="server in serverRows" :key="server.id" class="flex items-center gap-2">
                <UCheckbox
                  :model-value="transferForm.serverIds.includes(server.id)"
                  @update:model-value="
                    (value: boolean | 'indeterminate') => setTransferServerChecked(server.id, value)
                  "
                />
                <label class="text-sm">{{ server.name }}</label>
              </div>
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showTransferModal = false">{{
            t('common.cancel')
          }}</UButton>
          <UButton
            color="primary"
            :disabled="!transferForm.targetNodeId || transferForm.serverIds.length === 0"
            @click="handleTransferServers"
          >
            {{ t('admin.nodes.transferServers') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showCreateAllocationModal"
      :title="t('admin.nodes.createAllocations')"
      :description="t('admin.nodes.createAllocationsDescription')"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert icon="i-lucide-info">
            <template #title>{{ t('admin.nodes.bulkCreation') }}</template>
            <template #description>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>{{ t('admin.nodes.bulkCreationIpAddresses') }}</li>
                <li>{{ t('admin.nodes.bulkCreationPorts') }}</li>
                <li>{{ t('admin.nodes.bulkCreationCidrRange') }}</li>
                <li>{{ t('admin.nodes.bulkCreationPortRange') }}</li>
              </ul>
            </template>
          </UAlert>

          <UFormField :label="t('admin.nodes.allocations.ipAddressOrCidr')" name="ip" required>
            <UInput
              v-model="createAllocationForm.ip"
              :placeholder="t('admin.nodes.ipAddressOrCidrPlaceholder')"
              :disabled="isCreatingAllocations"
            />
            <template #help>
              {{ t('admin.nodes.ipAddressOrCidrHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.nodes.allocations.ports')" name="ports" required>
            <UInputTags
              v-model="createAllocationForm.ports"
              :placeholder="t('admin.nodes.portsPlaceholder')"
              :disabled="isCreatingAllocations"
              icon="i-lucide-network"
              :add-on-paste="true"
              :add-on-blur="true"
            />
            <template #help>
              {{ t('admin.nodes.portsHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.nodes.allocations.ipAlias')" name="ipAlias">
            <UInput
              v-model="createAllocationForm.ipAlias"
              :placeholder="t('admin.nodes.ipAliasPlaceholder')"
              :disabled="isCreatingAllocations"
            />
            <template #help>
              {{ t('admin.nodes.ipAliasHelp') }}
            </template>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            :disabled="isCreatingAllocations"
            @click="showCreateAllocationModal = false"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            color="primary"
            :loading="isCreatingAllocations"
            :disabled="
              isCreatingAllocations || !createAllocationForm.ip || !createAllocationForm.ports
            "
            @click="handleCreateAllocations"
          >
            {{ t('admin.nodes.createAllocations') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
