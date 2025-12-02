<script setup lang="ts">
import { computed, watch } from 'vue'

definePageMeta({
  auth: true,
  layout: 'server',
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const serverId = computed(() => route.params.id as string)

const { data: serverResponse, pending, error } = await useFetch<{ data: PanelServerDetails }>(
  `/api/servers/${serverId.value}`,
  {
    watch: [serverId],
    immediate: true,
  },
)

const server = computed(() => serverResponse.value?.data ?? null)

const breadcrumbLinks = computed(() => ([
  { label: t('server.list.title'), to: '/server' },
  { label: server.value?.name ?? serverId.value, to: `/server/${serverId.value}` },
]))

const primaryAllocation = computed(() => server.value?.allocations.primary ?? null)
const additionalAllocations = computed(() => server.value?.allocations.additional ?? [])

function formatAllocation(allocation: { ip: string; port: number } | null) {
  if (!allocation)
    return t('common.notAssigned')
  return `${allocation.ip}:${allocation.port}`
}

function formatLimit(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined)
    return t('common.na')
  return `${value.toLocaleString()} ${suffix}`
}

function formatDate(value: string | null | undefined) {
  if (!value)
    return t('common.unknown')
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? t('common.unknown') : date.toLocaleString()
}

watch(error, (err) => {
  if (err && err.statusCode === 404 && import.meta.client) {
    router.replace('/server')
  }
})

watch([pending, error, server], ([isPending, err, serverData]) => {
  if (!import.meta.client) {
    return
  }

  if (isPending || err || !serverData) {
    return
  }

  router.replace(`/server/${serverId.value}/console`)
})

const infoStats = computed(() => {
  const details = server.value
  if (!details) {
    return []
  }

  return [
    { icon: 'i-lucide-server', label: t('common.status'), value: details.status ?? t('common.unknown') },
    { icon: 'i-lucide-shield', label: t('common.suspended'), value: details.suspended ? t('common.yes') : t('common.no') },
    { icon: 'i-lucide-globe', label: t('server.details.primaryAllocation'), value: formatAllocation(primaryAllocation.value) },
    { icon: 'i-lucide-gauge', label: t('server.details.memory'), value: formatLimit(details.limits.memory, 'MB') },
    { icon: 'i-lucide-cpu', label: t('server.details.cpu'), value: formatLimit(details.limits.cpu, '%') },
    { icon: 'i-lucide-disc', label: t('server.details.disk'), value: formatLimit(details.limits.disk, 'MB') },
    { icon: 'i-lucide-timer', label: t('server.details.createdAt'), value: formatDate(details.createdAt) },
  ]
})
</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader
        v-if="server"
        :title="server.name"
        :description="server.description || t('server.list.noDescriptionProvided')"
      >
        <template #headline>
          <div class="flex items-center gap-2">
            <UBreadcrumb :links="breadcrumbLinks" size="xs" />
            <UBadge color="primary" size="xs">{{ server.status ?? t('common.unknown') }}</UBadge>
          </div>
        </template>
      </UPageHeader>
    </UContainer>

    <UPageBody>
      <UContainer>
        <UAlert v-if="error" color="error" :title="t('server.details.failedToLoadServer')">
          {{ error.message }}
        </UAlert>

        <USkeleton v-else-if="pending" class="h-72 w-full" />

        <div v-else-if="server" class="space-y-6">
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">{{ t('server.details.serverOverview') }}</h2>
            </div>
          </template>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-foreground">{{ t('server.details.general') }}</h3>
              <p class="text-sm text-muted-foreground">{{ server.description ?? t('server.list.noDescriptionProvided') }}</p>
              <div class="text-xs text-muted-foreground">
                {{ t('server.details.uuid') }}: <span class="font-mono text-foreground">{{ server.uuid }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ t('server.details.identifier') }}: <span class="font-mono text-foreground">{{ server.identifier }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ t('server.details.node') }}: <span class="text-foreground">{{ server.node.name ?? t('server.details.unassigned') }}</span>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ t('server.details.owner') }}: <span class="text-foreground">{{ server.owner.username ?? t('common.unknown') }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <h3 class="text-sm font-medium text-foreground">{{ t('server.details.limits') }}</h3>
              <ul class="space-y-1 text-xs text-muted-foreground">
                <li><span class="text-foreground">{{ t('server.details.memory') }}:</span> {{ formatLimit(server.limits.memory, 'MB') }}</li>
                <li><span class="text-foreground">{{ t('server.details.disk') }}:</span> {{ formatLimit(server.limits.disk, 'MB') }}</li>
                <li><span class="text-foreground">{{ t('server.details.cpu') }}:</span> {{ formatLimit(server.limits.cpu, '%') }}</li>
                <li><span class="text-foreground">{{ t('server.details.swap') }}:</span> {{ formatLimit(server.limits.swap, 'MB') }}</li>
                <li><span class="text-foreground">{{ t('server.details.io') }}:</span> {{ formatLimit(server.limits.io, 'MB/s') }}</li>
              </ul>
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">{{ t('server.details.networkAllocations') }}</h2>
            </div>
          </template>

          <div class="space-y-3">
            <div class="rounded-md border border-default bg-background px-3 py-3 text-sm">
              <div class="text-xs text-muted-foreground">{{ t('server.details.primaryAllocation') }}</div>
              <div class="mt-1 font-mono">{{ formatAllocation(primaryAllocation) }}</div>
            </div>

            <div>
              <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('server.details.additional') }}</div>
              <div v-if="additionalAllocations.length === 0" class="mt-2 text-xs text-muted-foreground">
                {{ t('server.details.noAdditionalAllocations') }}
              </div>
              <div
                v-else
                class="mt-2 grid gap-2"
              >
                <div
                  v-for="allocation in additionalAllocations"
                  :key="`${allocation.ip}:${allocation.port}`"
                  class="rounded-md border border-dashed border-default px-3 py-2 text-xs text-muted-foreground"
                >
                  <div class="font-mono text-sm text-foreground">{{ allocation.ip }}:{{ allocation.port }}</div>
                  <div>{{ allocation.description || t('server.details.noNotesProvided') }}</div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

        <div v-else class="text-sm text-muted-foreground">
          {{ t('server.details.serverDetailsUnavailable') }}
        </div>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside>
        <div class="space-y-4">
          <UCard :ui="{ body: 'space-y-3' }">
            <h2 class="text-sm font-semibold">{{ t('server.details.atAGlance') }}</h2>
            <div
              v-for="stat in infoStats"
              :key="stat.label"
              class="rounded-md border border-default bg-background px-3 py-3"
            >
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <UIcon :name="stat.icon" class="size-4 text-primary" />
                <span>{{ stat.label }}</span>
              </div>
              <p class="mt-2 text-sm font-semibold text-foreground">{{ stat.value }}</p>
            </div>
          </UCard>
        </div>
      </UPageAside>
    </template>
  </UPage>
</template>
