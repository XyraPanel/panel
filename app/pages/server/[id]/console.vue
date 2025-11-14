<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PowerAction } from '#shared/types/server-console'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const {
  connected,
  serverState,
  stats,
  statsHistory,
  logs,
  error: wsError,
  sendCommand,
  sendPowerAction,
  reconnect,
} = useServerWebSocket(serverId.value)

const showStats = ref(true)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function getStateColor(state: string): 'primary' | 'success' | 'warning' | 'error' {
  switch (state) {
    case 'running': return 'success'
    case 'starting': return 'warning'
    case 'stopping': return 'warning'
    case 'offline': return 'error'
    default: return 'primary'
  }
}

function getStateIcon(state: string): string {
  switch (state) {
    case 'running': return 'i-lucide-circle-check'
    case 'starting': return 'i-lucide-loader-2'
    case 'stopping': return 'i-lucide-loader-2'
    case 'offline': return 'i-lucide-circle-x'
    default: return 'i-lucide-circle'
  }
}

function handleCommand(command: string) {
  if (!command.trim() || !connected.value) return

  sendCommand(command)
}

function handlePowerAction(action: PowerAction) {
  if (!connected.value) return
  sendPowerAction(action)
}

const diskPercent = computed(() => {
  if (!stats.value) return 0

  const diskLimit = 10 * 1024 * 1024 * 1024
  return (stats.value.diskBytes / diskLimit) * 100
})
</script>

<template>
  <UPage>
    <UPageBody>
      <ServerStatusBanner
        :is-installing="false"
        :is-transferring="false"
        :is-suspended="false"
        :is-node-under-maintenance="false"
      />

      <div class="space-y-4">

        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <UBadge :color="getStateColor(serverState)" size="lg">
              <UIcon :name="getStateIcon(serverState)" :class="{ 'animate-spin': serverState === 'starting' || serverState === 'stopping' }" />
              <span class="ml-2 capitalize">{{ serverState }}</span>
            </UBadge>

            <UBadge v-if="!connected" color="error" size="sm">
              <UIcon name="i-lucide-wifi-off" />
              <span class="ml-1">Disconnected</span>
            </UBadge>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-play"
              color="success"
              size="sm"
              :disabled="!connected || serverState === 'running' || serverState === 'starting'"
              @click="() => handlePowerAction('start')"
            >
              Start
            </UButton>
            <UButton
              icon="i-lucide-rotate-cw"
              color="warning"
              size="sm"
              :disabled="!connected || serverState !== 'running'"
              @click="() => handlePowerAction('restart')"
            >
              Restart
            </UButton>
            <UButton
              icon="i-lucide-square"
              color="error"
              size="sm"
              :disabled="!connected || serverState === 'offline' || serverState === 'stopping'"
              @click="() => handlePowerAction('stop')"
            >
              Stop
            </UButton>
            <UButton
              icon="i-lucide-zap-off"
              color="error"
              variant="ghost"
              size="sm"
              :disabled="!connected || serverState === 'offline'"
              @click="() => handlePowerAction('kill')"
            >
              Kill
            </UButton>
          </div>
        </div>

        <UAlert v-if="wsError" color="error" icon="i-lucide-alert-circle">
          <template #title>Connection Error</template>
          <template #description>
            {{ wsError }}
          </template>
          <template #actions>
            <UButton color="error" variant="ghost" size="xs" @click="reconnect">
              Reconnect
            </UButton>
          </template>
        </UAlert>

        <UAlert v-else-if="!connected && !wsError" color="warning" icon="i-lucide-wifi-off">
          <template #title>Connecting...</template>
          <template #description>
            Establishing connection to server console
          </template>
        </UAlert>

        <ServerStatsChart v-if="showStats && stats" :stats="stats" :history="statsHistory" />

        <div v-if="showStats && stats" class="grid gap-4 md:grid-cols-2">
          <UCard>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">Disk Usage</span>
                <UIcon name="i-lucide-hard-drive" class="size-4 text-primary" />
              </div>
              <div class="text-2xl font-bold">{{ formatBytes(stats.diskBytes) }}</div>
              <UProgress :value="diskPercent" size="xs" />
            </div>
          </UCard>

          <UCard>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">Uptime</span>
                <UIcon name="i-lucide-clock" class="size-4 text-primary" />
              </div>
              <div class="text-2xl font-bold">{{ formatUptime(stats.uptime) }}</div>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Console</h2>
              <div class="flex items-center gap-2">
                <UButton
                  icon="i-lucide-bar-chart-3"
                  size="xs"
                  variant="ghost"
                  :color="showStats ? 'primary' : 'neutral'"
                  @click="showStats = !showStats"
                >
                  Stats
                </UButton>
              </div>
            </div>
          </template>

          <div class="h-[500px] overflow-hidden rounded-md bg-black">
            <ClientOnly>
              <ServerXTerminal
                :logs="logs"
                :connected="connected"
                @command="handleCommand"
              />
              <template #fallback>
                <div class="flex h-full items-center justify-center text-muted-foreground">
                  <div class="text-center">
                    <UIcon name="i-lucide-terminal" class="mx-auto size-12 opacity-50" />
                    <p class="mt-2">Loading terminal...</p>
                  </div>
                </div>
              </template>
            </ClientOnly>
          </div>
        </UCard>
      </div>
    </UPageBody>

    <template #right>
      <UPageAside>
        <UCard>
          <template #header>
            <h3 class="text-sm font-semibold">Connection</h3>
          </template>

          <div class="space-y-3 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Status</span>
              <UBadge :color="connected ? 'success' : 'error'" size="xs">
                {{ connected ? 'Connected' : 'Disconnected' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">State</span>
              <span class="capitalize">{{ serverState }}</span>
            </div>
            <div v-if="stats" class="flex items-center justify-between">
              <span class="text-muted-foreground">Network RX</span>
              <span>{{ formatBytes(stats.networkRxBytes) }}</span>
            </div>
            <div v-if="stats" class="flex items-center justify-between">
              <span class="text-muted-foreground">Network TX</span>
              <span>{{ formatBytes(stats.networkTxBytes) }}</span>
            </div>
          </div>
        </UCard>

        <UCard class="mt-4">
          <template #header>
            <h3 class="text-sm font-semibold">Quick Actions</h3>
          </template>

          <div class="space-y-2">
            <UButton
              block
              variant="ghost"
              size="sm"
              icon="i-lucide-file-text"
              :to="`/server/${serverId}/files`"
            >
              File Manager
            </UButton>
            <UButton
              block
              variant="ghost"
              size="sm"
              icon="i-lucide-database"
              :to="`/server/${serverId}/databases`"
            >
              Databases
            </UButton>
            <UButton
              block
              variant="ghost"
              size="sm"
              icon="i-lucide-archive"
              :to="`/server/${serverId}/backups`"
            >
              Backups
            </UButton>
            <UButton
              block
              variant="ghost"
              size="sm"
              icon="i-lucide-settings"
              :to="`/server/${serverId}/settings`"
            >
              Settings
            </UButton>
          </div>
        </UCard>
      </UPageAside>
    </template>
  </UPage>
</template>
