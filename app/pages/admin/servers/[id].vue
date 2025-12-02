<script setup lang="ts">
import type { AdminServerDetails } from '#shared/types/server'

const { t } = useI18n()
const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Server details',
  adminSubtitle: 'Manage server configuration and resources',
})

const serverId = computed(() => route.params.id as string)
const tab = ref<'overview' | 'build' | 'startup' | 'database' | 'mounts' | 'manage'>('overview')

const { data: serverData, pending, error } = await useFetch<{ data: AdminServerDetails }>(
  () => `/api/admin/servers/${serverId.value}`,
  {
    key: () => `admin-server-${serverId.value}`,
    watch: [serverId],
    onResponse({ response }) {
      console.log('[Server Detail] Response received:', {
        status: response.status,
        statusText: response.statusText,
        data: response._data,
        hasData: !!response._data,
        hasDataData: !!response._data?.data,
      })
    },
    onRequestError({ error }) {
      console.error('[Server Detail] Request error:', error)
    },
    onResponseError({ response }) {
      console.error('[Server Detail] Response error:', {
        status: response.status,
        statusText: response.statusText,
        data: response._data,
      })
    },
  },
)
const server = computed(() => {
  const s = serverData.value?.data
  console.log('[Server Detail] Computed server value:', {
    hasServerData: !!serverData.value,
    hasData: !!serverData.value?.data,
    server: s,
    serverKeys: s ? Object.keys(s) : [],
  })
  return s
})

watch([serverData, error, server], ([data, err, srv]) => {
  console.log('[Server Detail] Watch triggered:', {
    hasData: !!data,
    hasError: !!err,
    hasServer: !!srv,
    data: data,
    error: err,
    server: srv,
  })
  if (err) {
    console.error('[Server Detail] Error loading server:', err)
  }
  if (data) {
    console.log('[Server Detail] Server data received:', data)
  }
}, { immediate: true })

function formatDate(date: string | Date | null) {
  if (!date) return t('common.never')
  return new Date(date).toLocaleString()
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <div v-if="pending" class="space-y-4">
            <USkeleton class="h-8 w-3/4" />
            <USkeleton class="h-32" />
          </div>

          <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('admin.servers.unableToLoadServer') }}</template>
            <template #description>{{ (error as Error).message }}</template>
          </UAlert>

          <UCard v-if="!pending && !error && !server" color="warning">
            <template #header>
              <h2 class="text-lg font-semibold">{{ t('admin.servers.serverDataNotAvailable') }}</h2>
            </template>
            <div class="space-y-2 text-sm">
              <p><strong>Pending:</strong> {{ pending }}</p>
              <p><strong>Has Error:</strong> {{ !!error }}</p>
              <p><strong>Has Server Data:</strong> {{ !!serverData }}</p>
              <p><strong>Has Server:</strong> {{ !!server }}</p>
              <p><strong>Server ID:</strong> {{ serverId }}</p>
              <pre class="bg-gray-100 p-2 rounded text-xs overflow-auto">{{ JSON.stringify({ serverData, error, server }, null, 2) }}</pre>
            </div>
          </UCard>

          <template v-else-if="server">
            <header class="flex flex-wrap items-center justify-between gap-4">
              <div class="space-y-1">
                <p class="text-xs text-muted-foreground">{{ t('common.server') }} {{ serverId }}</p>
                <h1 class="text-xl font-semibold">{{ server.name }}</h1>
                <p class="text-xs text-muted-foreground">{{ server.identifier }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton icon="i-lucide-play" color="primary" variant="soft">{{ t('server.power.start') }}</UButton>
                <UButton icon="i-lucide-refresh-ccw" color="primary" variant="soft">{{ t('server.power.restart') }}</UButton>
                <UButton icon="i-lucide-square" color="error" variant="soft">{{ t('server.power.stop') }}</UButton>
              </div>
            </header>

            <UTabs v-model="tab" variant="link" :items="[
              { label: t('admin.servers.tabs.overview'), value: 'overview', icon: 'i-lucide-layout-dashboard' },
              { label: t('admin.servers.tabs.build'), value: 'build', icon: 'i-lucide-wrench' },
              { label: t('admin.servers.tabs.startup'), value: 'startup', icon: 'i-lucide-rocket' },
              { label: t('admin.servers.tabs.database'), value: 'database', icon: 'i-lucide-database' },
              { label: t('admin.servers.tabs.mounts'), value: 'mounts', icon: 'i-lucide-folder-tree' },
              { label: t('admin.servers.tabs.manage'), value: 'manage', icon: 'i-lucide-settings' },
            ]" class="w-full" />

            <UCard v-if="tab === 'overview'">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.servers.serverOverview') }}</h2>
              </template>
              <div class="space-y-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <p class="text-sm text-muted-foreground">{{ t('common.name') }}</p>
                    <p class="font-medium">{{ server.name }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">{{ t('admin.nodes.identifier') }}</p>
                    <code class="text-sm">{{ server.identifier }}</code>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">{{ t('common.created') }}</p>
                    <p class="text-sm">{{ formatDate(server.createdAt) }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">{{ t('common.updated') }}</p>
                    <p class="text-sm">{{ formatDate(server.updatedAt) }}</p>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="tab === 'build'">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.servers.buildConfiguration') }}</h2>
              </template>
              <AdminServerBuild v-if="server" :server="server" />
            </UCard>

            <UCard v-else-if="tab === 'startup'">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.servers.startupConfiguration') }}</h2>
              </template>
              <AdminServerStartup v-if="server" :server="server" />
            </UCard>

            <UCard v-else-if="tab === 'database'">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('server.databases.title') }}</h2>
              </template>
              <AdminServerDatabase v-if="server" :server-id="server.id" />
            </UCard>

            <UCard v-else-if="tab === 'mounts'">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.mounts.title') }}</h2>
              </template>
              <AdminServerMounts v-if="server" :server-id="server.id" />
            </UCard>

            <UCard v-else-if="tab === 'manage'">
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.servers.manage.title') }}</h2>
              </template>
              <AdminServerManage v-if="server" :server="server" />
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
