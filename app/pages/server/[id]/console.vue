<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { PowerAction, PanelServerDetails } from '#shared/types/server'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const { t } = useI18n()
const serverId = computed(() => route.params.id as string)

const { data: serverResponse } = await useFetch(
  `/api/servers/${serverId.value}`,
  {
    watch: [serverId],
    key: `server-${serverId.value}`,
    immediate: true,
  },
)
const serverData = computed(() => serverResponse.value as { data: PanelServerDetails } | null)

const server = computed(() => serverData.value?.data ?? null)
const primaryAllocation = computed(() => {
  return server.value?.allocations?.primary ?? null
})
const serverLimits = computed(() => server.value?.limits ?? null)

watch(server, (newServer) => {
  if (import.meta.client && newServer) {
    console.log('[Console] Server data loaded:', {
      uuid: newServer.uuid,
      hasAllocations: !!newServer.allocations,
      primaryAllocation: newServer.allocations?.primary,
      allAllocations: newServer.allocations,
    })
  }
}, { immediate: true })

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
} = useServerWebSocket(serverId)

const showStats = ref(true)
const terminalRef = ref<{ search?: (term: string) => void; clear?: () => void; downloadLogs?: () => void; scrollToBottom?: () => void } | null>(null)

const canSendCommands = computed(() => {
  const perms = server.value?.permissions || []
  return perms.includes('control.console') || perms.includes('*')
})

const commandInput = ref('')
const commandHistory = ref<string[]>([])
const historyIndex = ref(-1)

if (import.meta.client) {
  try {
    const stored = localStorage.getItem(`server-${serverId.value}:command_history`)
    if (stored) {
      commandHistory.value = JSON.parse(stored)
    }
  } catch (e) {
    console.warn('[Console] Failed to load command history:', e)
  }
}

function saveHistory() {
  if (import.meta.client) {
    try {
      localStorage.setItem(`server-${serverId.value}:command_history`, JSON.stringify(commandHistory.value))
    } catch (e) {
      console.warn('[Console] Failed to save command history:', e)
    }
  }
}

function handleCommandKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (commandHistory.value.length > 0) {
      historyIndex.value = Math.min(historyIndex.value + 1, commandHistory.value.length - 1)
      commandInput.value = commandHistory.value[historyIndex.value] || ''
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (historyIndex.value > 0) {
      historyIndex.value = Math.max(historyIndex.value - 1, -1)
      const nextCommand = historyIndex.value >= 0 ? commandHistory.value[historyIndex.value] : undefined
      commandInput.value = nextCommand ?? ''
    } else if (historyIndex.value === 0) {
      commandInput.value = ''
      historyIndex.value = -1
    }
  } else if (e.key === 'Enter' && commandInput.value.trim()) {
    e.preventDefault()
    const command = commandInput.value.trim()
    
    const index = commandHistory.value.indexOf(command)
    if (index > -1) {
      commandHistory.value.splice(index, 1)
    }
    commandHistory.value.unshift(command)
    if (commandHistory.value.length > 32) {
      commandHistory.value = commandHistory.value.slice(0, 32)
    }
    saveHistory()
    
    handleCommand(command)
    commandInput.value = ''
    historyIndex.value = -1
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return `0 ${t('common.bytes')}`
  const k = 1024
  const sizes = [t('common.bytes'), t('common.kb'), t('common.mb'), t('common.gb'), t('common.tb')]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const currentTime = ref(Date.now())
const lastStatsTime = ref<number | null>(null)
let uptimeInterval: ReturnType<typeof setInterval> | null = null

watch(() => stats.value?.uptime, () => {
  if (stats.value?.uptime) {
    lastStatsTime.value = Date.now()
  }
})

onMounted(() => {
  uptimeInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (uptimeInterval) {
    clearInterval(uptimeInterval)
    uptimeInterval = null
  }
})

const formattedUptime = computed(() => {
  if (!stats.value || !stats.value.uptime || !lastStatsTime.value) return '00:00:00'
  
  const baseUptimeMs = stats.value.uptime
  const elapsedSinceUpdate = currentTime.value - lastStatsTime.value
  const totalUptimeMs = baseUptimeMs + elapsedSinceUpdate
  
  // Convert to seconds
  const totalSeconds = Math.floor(totalUptimeMs / 1000)
  
  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
})

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
  console.log(`[Console] Command received from terminal:`, command)
  console.log(`[Console] Connection state:`, {
    connected: connected.value,
    command: command,
    trimmed: command.trim(),
  })
  
  if (!command.trim()) {
    console.warn('[Console] Empty command, ignoring')
    return
  }
  
  if (!connected.value) {
    console.warn('[Console] Not connected to WebSocket, ignoring command')
    return
  }

  console.log(`[Console] Sending command to WebSocket`)
  sendCommand(command)
}

function handlePowerAction(action: PowerAction) {
  if (!connected.value) return
  sendPowerAction(action)
}

function handleSearch() {
  if (!import.meta.client) return
  const { t } = useI18n()
  const term = (typeof globalThis !== 'undefined' && 'prompt' in globalThis)
    ? (globalThis as { prompt?: (message: string) => string | null }).prompt?.(t('server.console.search'))
    : null
  if (term) {
    terminalRef.value?.search?.(term)
  }
}


</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <ServerStatusBanner
          :is-installing="false"
          :is-transferring="false"
          :is-suspended="false"
          :is-node-under-maintenance="false"
        />

        <div class="space-y-4">

          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <UBadge v-if="!connected" color="error" size="sm">
                <UIcon name="i-lucide-wifi-off" />
                <span class="ml-1">{{ t('server.console.disconnected') }}</span>
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
                {{ t('server.console.start') }}
              </UButton>
              <UButton
                icon="i-lucide-rotate-cw"
                color="warning"
                size="sm"
                :disabled="!connected || serverState !== 'running'"
                @click="() => handlePowerAction('restart')"
              >
                {{ t('server.console.restart') }}
              </UButton>
              <UButton
                icon="i-lucide-square"
                color="error"
                size="sm"
                :disabled="!connected || serverState === 'offline' || serverState === 'stopping'"
                @click="() => handlePowerAction('stop')"
              >
                {{ t('server.console.stop') }}
              </UButton>
              <UButton
                icon="i-lucide-zap-off"
                color="error"
                variant="ghost"
                size="sm"
                :disabled="!connected || serverState === 'offline'"
                @click="() => handlePowerAction('kill')"
              >
                {{ t('server.console.kill') }}
              </UButton>
            </div>
          </div>

          <UAlert v-if="wsError && wsError !== 'Connecting...'" color="error" icon="i-lucide-alert-circle">
            <template #title>{{ t('server.console.connectionLost') }}</template>
            <template #description>
              {{ wsError }}
            </template>
            <template #actions>
              <UButton color="error" variant="ghost" size="xs" @click="reconnect">
                {{ t('server.console.reconnect') }}
              </UButton>
            </template>
          </UAlert>

          <UAlert v-else-if="!connected && (!wsError || wsError === 'Connecting...')" color="warning" icon="i-lucide-wifi-off">
            <template #title>{{ t('server.console.connecting') }}</template>
            <template #description>
              {{ t('server.console.connecting') }}
            </template>
          </UAlert>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('server.console.title') }}</h2>
                <div class="flex items-center gap-2">
                  <UButton
                    icon="i-lucide-bar-chart-3"
                    size="xs"
                    variant="ghost"
                    :color="showStats ? 'primary' : 'neutral'"
                    @click="showStats = !showStats"
                  >
                    {{ t('server.console.stats') }}
                  </UButton>
                </div>
              </div>
            </template>

            <div class="relative h-[500px] overflow-hidden rounded-md bg-black">
              <div class="absolute top-2 right-2 z-10 flex gap-2">
                <UButton
                  icon="i-lucide-search"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :title="t('server.console.searchInConsole')"
                  @click="handleSearch"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :title="t('server.console.clearConsole')"
                  @click="() => terminalRef?.clear?.()"
                />
                <UButton
                  icon="i-lucide-download"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :title="t('server.console.downloadLogs')"
                  @click="() => terminalRef?.downloadLogs?.()"
                />
                <UButton
                  icon="i-lucide-arrow-down"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :title="t('server.console.scrollToBottom')"
                  @click="() => terminalRef?.scrollToBottom?.()"
                />
              </div>
              <ClientOnly>
                <ServerXTerminal
                  ref="terminalRef"
                  :logs="logs"
                  :connected="connected"
                  :server-id="serverId"
                  @command="handleCommand"
                />
                <template #fallback>
                  <div class="flex h-full items-center justify-center text-muted-foreground">
                    <div class="text-center">
                      <UIcon name="i-lucide-terminal" class="mx-auto size-12 opacity-50" />
                      <p class="mt-2">{{ t('common.loading') }}</p>
                    </div>
                  </div>
                </template>
              </ClientOnly>
            </div>
            
            <div v-if="canSendCommands" class="relative border-t border-gray-800">
              <input
                v-model="commandInput"
                type="text"
                :placeholder="t('server.console.enterCommand')"
                :disabled="!connected"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="none"
                class="w-full bg-gray-900 px-10 py-2 text-gray-100 font-mono text-sm border-0 border-b-2 border-transparent focus:border-cyan-500 focus:ring-0 outline-none transition-colors"
                @keydown="handleCommandKeyDown"
              >
              <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-100 pointer-events-none">
                <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
              </div>
            </div>
          </UCard>

          <ServerStatsChart v-if="showStats && stats" :stats="stats" :history="statsHistory" />
        </div>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside>
        <UCard>
          <template #header>
            <h3 class="text-sm font-semibold">{{ t('server.console.connected') }}</h3>
          </template>

          <div class="space-y-3 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('common.status') }}</span>
              <UBadge :color="connected ? 'success' : 'error'" size="xs">
                {{ connected ? t('server.console.connected') : t('server.console.disconnected') }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('common.status') }}</span>
              <UBadge :color="getStateColor(serverState)" size="xs">
                <UIcon :name="getStateIcon(serverState)" :class="{ 'animate-spin': serverState === 'starting' || serverState === 'stopping' }" />
                <span class="ml-1 capitalize">{{ serverState }}</span>
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('server.console.ipPort') }}</span>
              <span v-if="primaryAllocation" class="font-mono">{{ primaryAllocation.ip }}:{{ primaryAllocation.port }}</span>
              <span v-else class="text-muted-foreground">{{ t('common.notAssigned') }}</span>
            </div>
            <div v-if="stats && stats.uptime" class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('server.console.uptime') }}</span>
              <span class="font-mono">{{ formattedUptime }}</span>
            </div>
            <div v-if="stats && stats.memoryLimitBytes" class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('server.console.memory') }}</span>
              <span>{{ formatBytes(stats.memoryBytes) }} / {{ formatBytes(stats.memoryLimitBytes) }}</span>
            </div>
            <div v-if="stats && serverLimits?.disk" class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('server.console.disk') }}</span>
              <span>{{ formatBytes(stats.diskBytes) }} / {{ formatBytes((serverLimits.disk || 0) * 1024 * 1024) }}</span>
            </div>
            <div v-if="stats" class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('server.console.network') }}</span>
              <span>{{ formatBytes(stats.networkRxBytes) }} / {{ formatBytes(stats.networkTxBytes) }}</span>
            </div>
          </div>
        </UCard>
      </UPageAside>
    </template>
  </UPage>
</template>
