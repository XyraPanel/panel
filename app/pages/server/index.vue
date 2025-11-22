<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ServersResponse } from '#shared/types/server'

const search = ref('')
const showAll = ref(false)

definePageMeta({
  auth: true,
})

const servers = ref<ServersResponse['data']>([])
const loading = ref(false)
const error = ref<string | null>(null)
const generatedAt = ref<string | null>(null)
const generatedAtDate = computed(() => (generatedAt.value ? new Date(generatedAt.value) : null))

const { data: me } = await useAsyncData('me', () => $fetch<{ user: { role: string } }>('/api/me'), {
  default: () => ({ user: { role: 'user' } }),
})

const isAdmin = computed(() => me.value?.user.role === 'admin')

watch(isAdmin, (admin) => {
  if (!admin && showAll.value) {
    showAll.value = false
  }
})

const scope = computed<'own' | 'all'>(() => (showAll.value && isAdmin.value ? 'all' : 'own'))

async function fetchServers(scope: 'own' | 'all') {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<ServersResponse>('/api/servers', {
      query: { scope },
    })
    servers.value = response.data
    generatedAt.value = response.generatedAt
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load servers'
  } finally {
    loading.value = false
  }
}

watch(scope, (value) => {
  fetchServers(value)
}, { immediate: true })

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
    return { label: 'Suspended', color: 'error' as const }
  }

  switch (status) {
    case 'running':
      return { label: 'Running', color: 'success' as const }
    case 'offline':
      return { label: 'Offline', color: 'error' as const }
    case 'starting':
      return { label: 'Starting', color: 'warning' as const }
    case 'stopping':
      return { label: 'Stopping', color: 'warning' as const }
    case 'installing':
      return { label: 'Installing', color: 'warning' as const }
    case 'restoring_backup':
      return { label: 'Restoring', color: 'warning' as const }
    default:
      return { label: 'Unknown', color: 'neutral' as const }
  }
}

function ownershipBadge(ownership: 'mine' | 'shared') {
  return ownership === 'mine'
    ? { label: 'My access', color: 'primary' as const }
    : { label: 'Shared access', color: 'neutral' as const }
}

function formatLimit(limits: Record<string, unknown> | null, key: 'memory' | 'disk' | 'cpu') {
  if (!limits) {
    return '—'
  }

  const raw = limits[key]
  if (typeof raw !== 'number') {
    return '—'
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
      <UPageHeader title="Servers">
        <template #description>
          <span>
            Overview of containers you can access across the cluster. Updated
            <NuxtTime
              v-if="generatedAtDate"
              :datetime="generatedAtDate"
              relative
              class="font-medium"
            />
            <span v-else>recently</span>
          </span>
        </template>
        <template #actions>
          <div class="flex items-center gap-2">
            <USwitch v-model="showAll" size="sm" :disabled="loading || !isAdmin" />
            <span class="text-sm">Show all</span>
            <span v-if="!isAdmin" class="text-xs text-muted-foreground">(admin)</span>
          </div>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search servers..."
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
              <h2 class="text-lg font-semibold">Registered servers</h2>
              <p class="text-sm text-muted-foreground">
                {{ showAll && isAdmin ? 'All servers in the panel' : 'Servers assigned to your account' }}
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
              title="No servers found"
              :description="search ? 'Try adjusting your search terms' : 'No servers are available'"
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
                    <p class="mt-1 text-xs text-muted-foreground">{{ server.description ?? 'No description provided.' }}</p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <UBadge :color="statusBadge(server.status, server.suspended).color" size="xs">
                    {{ statusBadge(server.status, server.suspended).label }}
                  </UBadge>
                  <UBadge v-if="server.isTransferring" color="warning" size="xs">
                    Transferring
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
                    CPU limit: {{ formatLimit(server.limits, 'cpu') }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-hard-drive" class="size-3" />
                    Disk limit: {{ formatLimit(server.limits, 'disk') }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-memory-stick" class="size-3" />
                    Memory limit: {{ formatLimit(server.limits, 'memory') }}
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
