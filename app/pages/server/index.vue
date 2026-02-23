<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ServersResponse } from '#shared/types/server';

const search = ref('');
const scopeSelection = ref<'own' | 'all'>('own');

definePageMeta({
  auth: true,
  title: 'Servers',
  subtitle: 'Manage your game servers and view their status',
});

function cleanedDescription(description?: string | null) {
  const trimmed = description?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

const { t } = useI18n();
const { data: me } = await useFetch<{ data: { role: string } }>('/api/me', {
  key: 'user-role',
  default: () => ({ data: { role: 'user' } }),
});

const isAdmin = computed(() => me.value?.data?.role === 'admin');

watch(isAdmin, (admin) => {
  if (!admin) {
    scopeSelection.value = 'own';
  }
});

const scope = computed<'own' | 'all'>(() => (isAdmin.value ? scopeSelection.value : 'own'));

const showAll = computed({
  get: () => scopeSelection.value === 'all',
  set: (value: boolean) => {
    scopeSelection.value = value ? 'all' : 'own';
  },
});

const {
  data: serversResponse,
  pending: loading,
  error: fetchError,
} = await useFetch<ServersResponse>('/api/servers', {
  key: 'servers-list',
  query: computed(() => ({ scope: scope.value })),
  watch: [scope],
});

const servers = computed(() => serversResponse.value?.data ?? []);
const error = computed(() => {
  if (!fetchError.value) return null;
  return fetchError.value instanceof Error ? fetchError.value.message : t('server.list.title');
});

const filteredServers = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) {
    return servers.value;
  }

  return servers.value.filter((server) =>
    [server.name, server.identifier, server.uuid, server.nodeName, server.description ?? ''].some(
      (value) => value.toLowerCase().includes(term),
    ),
  );
});

function statusBadge(status: string, suspended?: boolean) {
  if (suspended) {
    return { label: t('common.suspended'), color: 'error' as const };
  }

  switch (status) {
    case 'running':
      return { label: t('common.running'), color: 'success' as const };
    case 'offline':
      return { label: t('common.offline'), color: 'error' as const };
    case 'starting':
      return { label: t('common.starting'), color: 'warning' as const };
    case 'stopping':
      return { label: t('common.stopping'), color: 'warning' as const };
    case 'installing':
      return { label: t('common.installing'), color: 'warning' as const };
    case 'restoring_backup':
      return { label: t('common.restoring'), color: 'warning' as const };
    default:
      return { label: t('common.unknown'), color: 'neutral' as const };
  }
}

function formatLimit(limits: Record<string, unknown> | null, key: 'memory' | 'disk' | 'cpu') {
  if (!limits) {
    return t('common.na');
  }

  const raw = limits[key];
  if (typeof raw !== 'number') {
    return t('common.na');
  }

  if (key === 'cpu') {
    return `${raw}%`;
  }

  const gib = raw / 1024;
  return gib >= 1 ? `${gib.toFixed(1)} GiB` : `${raw} MiB`;
}

const scopeToggleText = computed(() => {
  if (!isAdmin.value) {
    return t('server.list.scopeMineLabel');
  }

  if (showAll.value) {
    return t('server.list.scopeAllLabel');
  }

  return t('server.list.scopeMineLabel');
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <USwitch
          v-if="isAdmin"
          v-model="showAll"
          size="sm"
          color="primary"
          checked-icon="i-lucide-users"
          unchecked-icon="i-lucide-user"
          :disabled="loading"
          :label="scopeToggleText"
          class="w-full sm:w-auto lg:min-w-[220px]"
        />
      </div>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('server.list.searchServers')"
        trailing-icon="i-lucide-x"
        :trailing="!!search"
        class="w-full sm:w-64"
        @trailing-click="search = ''"
      />
    </div>

    <div>
      <UCard :ui="{ body: 'space-y-4' }">
        <div class="pb-2 text-sm text-muted-foreground">
          {{
            showAll && isAdmin
              ? t('server.list.allServersInPanel')
              : t('server.list.serversAssignedToAccount')
          }}
        </div>

        <div class="space-y-3">
          <div v-if="loading" class="space-y-2">
            <USkeleton v-for="i in 4" :key="`skeleton-${i}`" class="h-16 w-full rounded-lg" />
          </div>
          <div
            v-else-if="error"
            class="rounded-lg border border-dashed border-default p-6 text-sm text-destructive"
          >
            {{ error }}
          </div>
          <UEmpty
            v-else-if="filteredServers.length === 0"
            icon="i-lucide-server-off"
            :title="t('server.list.noServersFound')"
            :description="
              search ? t('server.list.tryAdjustingSearch') : t('server.list.noServersAvailable')
            "
          />
          <div
            v-for="server in filteredServers"
            :key="server.uuid"
            class="group rounded-2xl border border-default/70 bg-background/90 p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div class="flex flex-1 items-start gap-3">
                <div
                  class="flex size-10 items-center justify-center rounded-2xl transition-colors"
                  :class="{
                    'bg-success/10 text-success': server.status === 'running' && !server.suspended,
                    'bg-error/10 text-error': server.status === 'offline' || server.suspended,
                    'bg-warning/10 text-warning': ['starting', 'stopping', 'installing'].includes(
                      server.status ?? '',
                    ),
                  }"
                >
                  <UIcon name="i-lucide-server" class="size-5" />
                </div>
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <NuxtLink
                      :to="`/server/${server.identifier}/console`"
                      class="text-base font-semibold text-foreground hover:text-primary"
                    >
                      {{ server.name }}
                    </NuxtLink>
                    <UBadge size="sm" color="neutral" variant="soft">{{
                      server.identifier
                    }}</UBadge>
                    <UBadge size="sm" color="neutral" variant="soft">{{ server.nodeName }}</UBadge>
                    <UBadge
                      :color="statusBadge(server.status, server.suspended).color"
                      size="sm"
                      variant="soft"
                    >
                      {{ statusBadge(server.status, server.suspended).label }}
                    </UBadge>
                    <UBadge v-if="server.isTransferring" color="warning" size="sm" variant="soft">
                      {{ t('common.transferring') }}
                    </UBadge>
                  </div>
                  <div
                    class="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground"
                  >
                    <span class="inline-flex items-center gap-1">
                      <UIcon name="i-lucide-network" class="size-3.5 text-foreground/70" />
                      {{ t('server.list.primaryAllocationLabel') }}:
                      <span class="text-foreground">
                        {{ server.primaryAllocation ?? t('common.na') }}
                      </span>
                    </span>
                  </div>
                  <p
                    v-if="cleanedDescription(server.description)"
                    class="text-sm text-muted-foreground line-clamp-1"
                  >
                    {{ cleanedDescription(server.description) }}
                  </p>
                </div>
              </div>

              <div
                class="flex flex-1 flex-wrap items-center justify-start gap-2 text-[11px] text-muted-foreground md:flex-none md:justify-end"
              >
                <div
                  class="flex flex-wrap items-center gap-3 text-xs md:text-sm text-muted-foreground"
                >
                  <div class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-gauge" class="size-4 text-foreground/60" />
                    <span class="text-foreground/80">{{ t('server.list.cpuLimit') }}:</span>
                    <span class="font-mono text-foreground">{{
                      formatLimit(server.limits, 'cpu')
                    }}</span>
                  </div>
                  <div class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-memory-stick" class="size-4 text-foreground/60" />
                    <span class="text-foreground/80">{{ t('server.list.memoryLimit') }}:</span>
                    <span class="font-mono text-foreground">{{
                      formatLimit(server.limits, 'memory')
                    }}</span>
                  </div>
                  <div class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-hard-drive" class="size-4 text-foreground/60" />
                    <span class="text-foreground/80">{{ t('server.list.diskLimit') }}:</span>
                    <span class="font-mono text-foreground">{{
                      formatLimit(server.limits, 'disk')
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
