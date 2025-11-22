<script setup lang="ts">
import type { Server } from '#shared/types/server'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Server details',
  adminSubtitle: 'Manage server configuration and resources',
})

const serverId = computed(() => route.params.id as string)
const tab = ref<'overview' | 'build' | 'startup' | 'database' | 'mounts' | 'manage'>('overview')

const { data: serverData, pending, error } = await useFetch<{ data: Server }>(
  () => `/api/admin/servers/${serverId.value}`,
  {
    key: () => `admin-server-${serverId.value}`,
    watch: [serverId],
  },
)
const server = computed(() => serverData.value?.data)

function formatDate(date: string | Date | null) {
  if (!date) return 'Never'
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
            <template #title>Unable to load server</template>
            <template #description>{{ (error as Error).message }}</template>
          </UAlert>

          <template v-else-if="server">
            <header class="flex flex-wrap items-center justify-between gap-4">
              <div class="space-y-1">
                <p class="text-xs text-muted-foreground">Server {{ serverId }}</p>
                <h1 class="text-xl font-semibold">{{ server.name }}</h1>
                <p class="text-xs text-muted-foreground">{{ server.identifier }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton icon="i-lucide-play" color="primary" variant="soft">Start</UButton>
                <UButton icon="i-lucide-refresh-ccw" color="primary" variant="soft">Restart</UButton>
                <UButton icon="i-lucide-square" color="error" variant="soft">Stop</UButton>
              </div>
            </header>

            <UTabs v-model="tab" variant="link" :items="[
              { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
              { label: 'Build', value: 'build', icon: 'i-lucide-wrench' },
              { label: 'Startup', value: 'startup', icon: 'i-lucide-rocket' },
              { label: 'Database', value: 'database', icon: 'i-lucide-database' },
              { label: 'Mounts', value: 'mounts', icon: 'i-lucide-folder-tree' },
              { label: 'Manage', value: 'manage', icon: 'i-lucide-settings' },
            ]" class="w-full" />

            <UCard v-if="tab === 'overview'">
              <template #header>
                <h2 class="text-lg font-semibold">Server Overview</h2>
              </template>
              <div class="space-y-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <p class="text-sm text-muted-foreground">Name</p>
                    <p class="font-medium">{{ server.name }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">Identifier</p>
                    <code class="text-sm">{{ server.identifier }}</code>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">Created</p>
                    <p class="text-sm">{{ formatDate(server.createdAt) }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-muted-foreground">Updated</p>
                    <p class="text-sm">{{ formatDate(server.updatedAt) }}</p>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="tab === 'build'">
              <template #header>
                <h2 class="text-lg font-semibold">Build Configuration</h2>
              </template>
              <AdminServerBuild v-if="server" :server="server" />
            </UCard>

            <UCard v-else-if="tab === 'startup'">
              <template #header>
                <h2 class="text-lg font-semibold">Startup Configuration</h2>
              </template>
              <AdminServerStartup v-if="server" :server="server" />
            </UCard>

            <UCard v-else-if="tab === 'database'">
              <template #header>
                <h2 class="text-lg font-semibold">Databases</h2>
              </template>
              <AdminServerDatabase v-if="server" :server-id="server.id" />
            </UCard>

            <UCard v-else-if="tab === 'mounts'">
              <template #header>
                <h2 class="text-lg font-semibold">Mounts</h2>
              </template>
              <AdminServerMounts v-if="server" :server-id="server.id" />
            </UCard>

            <UCard v-else-if="tab === 'manage'">
              <template #header>
                <h2 class="text-lg font-semibold">Manage Server</h2>
              </template>
              <AdminServerManage v-if="server" :server="server" />
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
