<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ServersResponse } from '#shared/types/server'

const search = ref('')
const scopeSelection = ref<'own' | 'all'>('own')

definePageMeta({
  auth: true,
})

const { t } = useI18n()
const { data: me } = await useFetch<{ data: { role: string } }>('/api/me', {
  key: 'user-role',
  default: () => ({ data: { role: 'user' } }),
})

const isAdmin = computed(() => me.value?.data?.role === 'admin')

watch(isAdmin, (admin) => {
  if (!admin) {
    scopeSelection.value = 'own'
  }
})

const scope = computed<'own' | 'all'>(() => (isAdmin.value ? scopeSelection.value : 'own'))

const showAll = computed({
  get: () => scopeSelection.value === 'all',
  set: (value: boolean) => {
    scopeSelection.value = value ? 'all' : 'own'
  },
})

const {
  data: serversResponse,
  pending: loading,
  error: fetchError,
} = await useFetch<ServersResponse>('/api/servers', {
  key: 'servers-list',
  query: computed(() => ({ scope: scope.value })),
  watch: [scope],
})

const servers = computed(() => serversResponse.value?.data ?? [])
const generatedAt = computed(() => serversResponse.value?.generatedAt ?? null)
const generatedAtDate = computed(() => (generatedAt.value ? new Date(generatedAt.value) : null))
const error = computed(() => {
  if (!fetchError.value) return null
  return fetchError.value instanceof Error ? fetchError.value.message : t('server.list.title')
})

const filteredServers = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) {
    return servers.value
  }

  return servers.value.filter((server) => (
    [
      server.name,
      server.identifier,
      server.uuid,
      server.nodeName,
      server.description ?? '',
    ].some(value => value.toLowerCase().includes(term))
  ))
})

function statusBadge(status: string, suspended?: boolean) {
  if (suspended) {
    return { label: t('common.suspended'), color: 'error' as const }
  }

  switch (status) {
    case 'running':
      return { label: t('common.running'), color: 'success' as const }
    case 'offline':
      return { label: t('common.offline'), color: 'error' as const }
    case 'starting':
      return { label: t('common.starting'), color: 'warning' as const }
    case 'stopping':
      return { label: t('common.stopping'), color: 'warning' as const }
    case 'installing':
      return { label: t('common.installing'), color: 'warning' as const }
    case 'restoring_backup':
      return { label: t('common.restoring'), color: 'warning' as const }
    default:
      return { label: t('common.unknown'), color: 'neutral' as const }
  }
}

function ownershipBadge(ownership: 'mine' | 'shared') {
  return ownership === 'mine'
    ? { label: t('server.list.myAccess'), color: 'primary' as const }
    : { label: t('server.list.sharedAccess'), color: 'neutral' as const }
}

function formatLimit(limits: Record<string, unknown> | null, key: 'memory' | 'disk' | 'cpu') {
  if (!limits) {
    return t('common.na')
  }

  const raw = limits[key]
  if (typeof raw !== 'number') {
    return t('common.na')
  }

  if (key === 'cpu') {
    return `${raw}%`
  }

  const gib = raw / 1024
  return gib >= 1 ? `${gib.toFixed(1)} GiB` : `${raw} MiB`
}

const scopeToggleText = computed(() => {
  if (!isAdmin.value) {
    return {
      label: t('server.list.scopeMineLabel'),
      description: t('server.list.scopeMineDescription'),
    }
  }

  if (showAll.value) {
    return {
      label: t('server.list.scopeAllLabel'),
      description: t('server.list.scopeAllDescription'),
    }
  }

  return {
    label: t('server.list.scopeMineLabel'),
    description: t('server.list.scopeMineDescription'),
  }
})
</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader :title="t('server.list.title')">
        <template #description>
          <div class="space-y-3">
            <span>
              {{ t('server.list.description', { time: generatedAtDate ? '' : t('server.list.recently') }) }}
              <NuxtTime
                v-if="generatedAtDate"
                :datetime="generatedAtDate"
                relative
                class="font-medium"
              />
              <span v-else>{{ t('server.list.recently') }}</span>
            </span>
            <USwitch
              v-model="showAll"
              size="sm"
              color="primary"
              checked-icon="i-lucide-users"
              unchecked-icon="i-lucide-user"
              :disabled="loading || !isAdmin"
              :label="scopeToggleText.label"
              :description="scopeToggleText.description"
            />
          </div>
        </template>
        <template #actions>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="t('server.list.searchServers')"
            trailing-icon="i-lucide-x"
            :trailing="!!search"
            class="w-64"
            @trailing-click="search = ''"
          />
        </template>
      </UPageHeader>
    </UContainer>

    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div>
              <h2 class="text-lg font-semibold">{{ t('server.list.registeredServers') }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ showAll && isAdmin ? t('server.list.allServersInPanel') : t('server.list.serversAssignedToAccount') }}
              </p>
            </div>
          </template>

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
              :description="search ? t('server.list.tryAdjustingSearch') : t('server.list.noServersAvailable')"
            />
            <div
              v-for="server in filteredServers"
              :key="server.uuid"
              class="group rounded-2xl border border-default/70 bg-background/80 p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="flex items-start gap-4">
                  <div
                    class="flex size-12 items-center justify-center rounded-2xl transition-colors"
                    :class="{
                      'bg-success/10 text-success': server.status === 'running' && !server.suspended,
                      'bg-error/10 text-error': server.status === 'offline' || server.suspended,
                      'bg-warning/10 text-warning': ['starting', 'stopping', 'installing'].includes(server.status ?? '')
                    }"
                  >
                    <UIcon name="i-lucide-server" class="size-5" />
                  </div>
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <NuxtLink :to="`/server/${server.uuid}/console`" class="text-base font-semibold text-foreground hover:text-primary">
                        {{ server.name }}
                      </NuxtLink>
                      <UBadge size="xs" color="neutral">{{ server.identifier }}</UBadge>
                      <UBadge size="xs" color="neutral" variant="soft">{{ server.nodeName }}</UBadge>
                    </div>
                    <p class="text-sm text-muted-foreground">{{ server.description ?? t('server.list.noDescriptionProvided') }}</p>
                    <p class="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <UIcon name="i-lucide-hash" class="size-3" />
                      {{ server.uuid }}
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 text-xs">
                  <UBadge :color="statusBadge(server.status, server.suspended).color" size="xs" variant="soft">
                    {{ statusBadge(server.status, server.suspended).label }}
                  </UBadge>
                  <UBadge v-if="server.isTransferring" color="warning" size="xs" variant="soft">
                    {{ t('common.transferring') }}
                  </UBadge>
                  <UBadge :color="ownershipBadge(server.ownership).color" size="xs" variant="soft">
                    {{ ownershipBadge(server.ownership).label }}
                  </UBadge>
                </div>
              </div>

              <div class="mt-4 grid gap-3 border-t border-dashed border-default/60 pt-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-gauge" class="size-4 text-foreground/70" />
                  <span class="font-medium text-foreground">{{ t('server.list.cpuLimit') }}</span>
                  <span>{{ formatLimit(server.limits, 'cpu') }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-memory-stick" class="size-4 text-foreground/70" />
                  <span class="font-medium text-foreground">{{ t('server.list.memoryLimit') }}</span>
                  <span>{{ formatLimit(server.limits, 'memory') }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-hard-drive" class="size-4 text-foreground/70" />
                  <span class="font-medium text-foreground">{{ t('server.list.diskLimit') }}</span>
                  <span>{{ formatLimit(server.limits, 'disk') }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-network" class="size-4 text-foreground/70" />
                  <span class="font-medium text-foreground">{{ t('server.list.primaryAllocationLabel') }}</span>
                  <span>{{ server.primaryAllocation ?? t('common.na') }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
