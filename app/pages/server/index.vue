<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ServersResponse } from '#shared/types/server'

const search = ref('')
const showAll = ref(false)

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
  if (!admin && showAll.value) {
    showAll.value = false
  }
})

const scope = computed<'own' | 'all'>(() => (showAll.value && isAdmin.value ? 'all' : 'own'))

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
</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader :title="t('server.list.title')">
        <template #description>
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
        </template>
        <template #actions>
          <div class="flex items-center gap-2">
            <USwitch v-model="showAll" size="sm" :disabled="loading || !isAdmin" />
            <span class="text-sm">{{ t('server.list.showAll') }}</span>
            <span v-if="!isAdmin" class="text-xs text-muted-foreground">{{ t('server.list.adminOnly') }}</span>
          </div>
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
              class="relative rounded-lg border border-default bg-background/80 p-4 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div class="flex flex-wrap items-center gap-4 md:gap-6">
                <div
                  class="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg transition-colors"
                  :class="{
                    'bg-success': server.status === 'running' && !server.suspended,
                    'bg-error': server.status === 'offline' || server.suspended,
                    'bg-warning': server.status === 'starting' || server.status === 'stopping' || server.status === 'installing'
                  }"
                />

                <div class="flex min-w-[240px] items-center gap-3">
                  <div class="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <UIcon name="i-lucide-server" class="size-5" />
                  </div>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <NuxtLink :to="`/server/${server.uuid}`" class="text-sm font-semibold text-foreground hover:text-primary">
                        {{ server.name }}
                      </NuxtLink>
                      <UBadge size="xs" color="neutral">{{ server.identifier }}</UBadge>
                      <UBadge size="xs" color="neutral" variant="soft">{{ server.nodeName }}</UBadge>
                    </div>
                    <p class="mt-1 text-xs text-muted-foreground">{{ server.description ?? t('server.list.noDescriptionProvided') }}</p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <UBadge :color="statusBadge(server.status, server.suspended).color" size="xs">
                    {{ statusBadge(server.status, server.suspended).label }}
                  </UBadge>
                  <UBadge v-if="server.isTransferring" color="warning" size="xs">
                    {{ t('common.transferring') }}
                  </UBadge>
                  <UBadge :color="ownershipBadge(server.ownership).color" size="xs" variant="soft">
                    {{ ownershipBadge(server.ownership).label }}
                  </UBadge>
                </div>

                <div class="hidden h-6 w-px bg-default md:block" />

                <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-hash" class="size-3" />
                    {{ server.uuid }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-gauge" class="size-3" />
                    {{ t('server.list.cpuLimit') }}: {{ formatLimit(server.limits, 'cpu') }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-hard-drive" class="size-3" />
                    {{ t('server.list.diskLimit') }}: {{ formatLimit(server.limits, 'disk') }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-memory-stick" class="size-3" />
                    {{ t('server.list.memoryLimit') }}: {{ formatLimit(server.limits, 'memory') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
