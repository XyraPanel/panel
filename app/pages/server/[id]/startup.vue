<script setup lang="ts">
import type { ServerStartupVariable } from '#shared/types/server-startup'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const { data: variablesData, pending, error } = await useAsyncData(
  `server-${serverId.value}-startup`,
  () => $fetch<{ data: ServerStartupVariable[] }>(`/api/servers/${serverId.value}/startup`),
  {
    watch: [serverId],
  },
)

const variables = computed(() => variablesData.value?.data || [])

const startupCommand = computed(() => {
  const vars = variables.value
  if (vars.length === 0) return 'No startup command configured'

  const jarFile = vars.find(v => v.key === 'SERVER_JARFILE')?.value || 'server.jar'
  const memory = vars.find(v => v.key === 'SERVER_MEMORY')?.value || '2048'

  return `java -Xms128M -Xmx${memory}M -jar ${jarFile}`
})
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">Server {{ serverId }} · Startup</p>
            <h1 class="text-xl font-semibold">Startup configuration</h1>
          </div>
        </header>

        <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
            <div>
              <p class="font-medium">Failed to load startup configuration</p>
              <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
        </div>

        <template v-else>
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 class="text-lg font-semibold">Startup Command</h2>
                  <p class="text-xs text-muted-foreground">Generated from environment variables</p>
                </div>
              </div>
            </template>

            <div class="space-y-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Launch command</p>
                <code class="mt-2 block rounded bg-muted px-3 py-2 text-sm">{{ startupCommand }}</code>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Environment Variables</h2>
              </div>
            </template>

            <div v-if="variables.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
              <UIcon name="i-lucide-settings" class="mx-auto size-12 text-muted-foreground/50" />
              <p class="mt-3 text-sm font-medium">No variables configured</p>
              <p class="mt-1 text-xs text-muted-foreground">Environment variables will appear here once configured.</p>
            </div>

            <div v-else class="overflow-hidden rounded-lg border border-default">
              <div class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span class="col-span-3">Key</span>
                <span class="col-span-3">Value</span>
                <span class="col-span-5">Description</span>
                <span class="col-span-1 text-right">Edit</span>
              </div>
              <div class="divide-y divide-default">
                <div
                  v-for="variable in variables"
                  :key="variable.id"
                  class="grid grid-cols-12 gap-2 px-4 py-3 text-sm"
                >
                  <span class="col-span-3 font-medium">{{ variable.key }}</span>
                  <code class="col-span-3 rounded bg-muted px-2 py-1 text-xs">{{ variable.value }}</code>
                  <span class="col-span-5 text-xs text-muted-foreground">{{ variable.description || '—' }}</span>
                  <div class="col-span-1 flex justify-end">
                    <UBadge v-if="variable.isEditable" size="xs" color="primary">Editable</UBadge>
                    <UBadge v-else size="xs" color="neutral">Read-only</UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </template>
        </section>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>
  </UPage>
</template>
