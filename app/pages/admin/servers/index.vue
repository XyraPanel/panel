<script setup lang="ts">
import type { AdminRemoteServerRow } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Servers',
  adminSubtitle: 'Global view of panel servers synchronized with Wings',
})

const {
  data: serversResponse,
  pending: serversPending,
  error: serversError,
} = await useAsyncData('admin-servers', () => $fetch<{ data: AdminRemoteServerRow[] }>('/api/wings/servers'))

const servers = computed(() => serversResponse.value?.data ?? [])

</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Server inventory</h2>
                <UButton icon="i-lucide-plus" color="primary" variant="subtle" to="/admin/servers/create">
                  Create Server
                </UButton>
              </div>
            </template>

            <div class="overflow-hidden rounded-lg border border-default">
              <div
                class="grid grid-cols-12 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span class="col-span-3">Server</span>
                <span class="col-span-3">Identifier</span>
                <span class="col-span-2">Node</span>
                <span class="col-span-2">Status</span>
                <span class="col-span-2">Players</span>
              </div>
              <div v-if="serversPending" class="space-y-2 p-4">
                <USkeleton v-for="i in 4" :key="i" class="h-10 w-full" />
              </div>
              <div v-else-if="serversError" class="p-4 text-sm text-destructive">
                Failed to load servers.
              </div>
              <div v-else-if="servers.length === 0" class="p-4 text-sm text-muted-foreground">
                No servers were found.
              </div>
              <div v-else class="divide-y divide-default">
                <div v-for="server in servers" :key="server.identifier" class="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                  <div class="col-span-3 space-y-1">
                    <NuxtLink :to="`/admin/servers/${server.identifier}`"
                      class="text-sm font-semibold text-primary hover:underline">
                      {{ server.name }}
                    </NuxtLink>
                    <p class="text-xs text-muted-foreground">UUID: {{ server.uuid }}</p>
                  </div>
                  <span class="col-span-3 text-xs text-muted-foreground">{{ server.identifier }}</span>
                  <span class="col-span-2 text-xs text-muted-foreground">{{ server.node }}</span>
                  <div class="col-span-2">
                    <UBadge size="xs" color="neutral">
                      Unknown
                    </UBadge>
                  </div>
                  <span class="col-span-2 text-xs text-muted-foreground">N/A</span>
                  <div class="col-span-1 text-[11px] text-muted-foreground">
                    <code>GET /servers/{{ server.identifier }}</code>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
