import { onUnmounted, ref } from 'vue'
import type { ServerStats, ServerState, WebSocketMessage } from '#shared/types/server-console'

interface ServerEventDetails {
  event: string
  message?: string
  raw?: string
  timestamp: number
}

const MAX_HISTORY_POINTS = 60
const RECONNECT_DELAY = 5000

interface WingsStatsPayload {
  memory_bytes?: number
  memory_limit_bytes?: number
  cpu_absolute?: number
  disk_bytes?: number
  uptime?: number
  state?: string
  status?: string
  memory?: number
  memory_limit?: number
  cpu?: number
  disk?: number
  network?: {
    rx_bytes?: number
    tx_bytes?: number
  }
  network_rx_bytes?: number
  network_tx_bytes?: number
}

function mapWingsStats(payload: WingsStatsPayload): ServerStats {
  const network = payload.network || {}
  return {
    memoryBytes: Number(payload.memory_bytes ?? payload.memory ?? 0),
    memoryLimitBytes: Number(payload.memory_limit_bytes ?? payload.memory_limit ?? 0),
    cpuAbsolute: Number(payload.cpu_absolute ?? payload.cpu ?? 0),
    diskBytes: Number(payload.disk_bytes ?? payload.disk ?? 0),
    uptime: Number(payload.uptime ?? 0),
    state: (payload.state ?? payload.status ?? 'offline') as ServerState,
    networkRxBytes: Number(network.rx_bytes ?? payload.network_rx_bytes ?? 0),
    networkTxBytes: Number(network.tx_bytes ?? payload.network_tx_bytes ?? 0),
  }
}

export function useServerWebSocket(serverId: string) {
  const socket = ref<WebSocket | null>(null)
  const connected = ref(false)
  const connecting = ref(false)
  const serverState = ref<ServerState>('offline')
  const stats = ref<ServerStats | null>(null)
  const statsHistory = ref<Array<{ timestamp: number; stats: ServerStats }>>([])
  const logs = ref<string[]>([])
  const error = ref<string | null>(null)

  const currentToken = ref<string | null>(null)
  const currentSocketUrl = ref<string | null>(null)
  const tokenRefreshInFlight = ref(false)
  const reconnectTimer = ref<number | null>(null)
  const lifecycleStatus = ref<'normal' | 'installing' | 'transferring' | 'restoring' | 'error'>('normal')
  const lifecycleMessage = ref<string>('')
  const lifecycleProgress = ref<number | null>(null)

  const recentEvents = ref<ServerEventDetails[]>([])

  let intentionalClose = false
  let reconnectAfterClose = false
  let disposed = false

  const recordEvent = (details: ServerEventDetails) => {
    recentEvents.value.unshift(details)
    if (recentEvents.value.length > 100) {
      recentEvents.value.pop()
    }
  }

  const clearLifecycle = () => {
    lifecycleStatus.value = 'normal'
    lifecycleMessage.value = ''
    lifecycleProgress.value = null
  }

  const setLifecycle = (status: typeof lifecycleStatus.value, message?: string, progress?: number | null) => {
    lifecycleStatus.value = status
    lifecycleMessage.value = message ?? ''
    lifecycleProgress.value = typeof progress === 'number' ? progress : null
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer.value !== null) {
      clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }
  }

  const scheduleReconnect = (delay = RECONNECT_DELAY) => {
    if (disposed || reconnectTimer.value !== null) {
      return
    }

    reconnectTimer.value = window.setTimeout(() => {
      reconnectTimer.value = null
      void connect()
    }, delay)
  }

  const fetchCredentials = async () => {
    return $fetch<{ token: string; socket: string }>(`/api/client/servers/${serverId}/websocket`)
  }

  const send = (event: string, args: string[] = []) => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      return
    }

    socket.value.send(JSON.stringify({ event, args }))
  }

  const sendAuthenticate = (token: string | null) => {
    if (!token) {
      return
    }

    send('authenticate', [token])
  }

  const handleConsoleOutput = (lines: string[]) => {
    lines.forEach((line) => {
      logs.value.push(line)
      if (logs.value.length > 1000) {
        logs.value.shift()
      }
    })
  }

  const handleStats = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as WingsStatsPayload
      const mapped = mapWingsStats(parsed)
      stats.value = mapped
      serverState.value = mapped.state

      statsHistory.value.push({
        timestamp: Date.now(),
        stats: mapped,
      })

      if (statsHistory.value.length > MAX_HISTORY_POINTS) {
        statsHistory.value.shift()
      }
    }
    catch (err) {
      console.error('Failed to parse stats payload:', err)
    }
  }

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.event) {
      case 'auth success':
        connected.value = true
        error.value = null
        send('send logs', [])
        send('send stats', [])
        break

      case 'auth failed':
        connected.value = false
        error.value = 'WebSocket authentication failed'
        break

      case 'status':
        if (message.args && message.args[0]) {
          serverState.value = message.args[0] as ServerState
          recordEvent({ event: 'status', message: message.args[0], timestamp: Date.now() })
          if (message.args[0] === 'running' && lifecycleStatus.value !== 'normal') {
            clearLifecycle()
          }
        }
        break

      case 'console output':
      case 'install output':
      case 'daemon message':
        if (message.args && message.args.length > 0) {
          handleConsoleOutput(message.args)
          recordEvent({ event: message.event, raw: message.args.join('\n'), timestamp: Date.now() })
          if (message.event === 'install output') {
            if (message.args && message.args.length > 0) {
              const lastLine = message.args[message.args.length - 1]
              setLifecycle('installing', lastLine)
            }
          }
          if (message.event === 'daemon message' && message.args && message.args[0]) {
            error.value = message.args[0]
          }
        }
        break

      case 'install started':
        setLifecycle('installing', 'Installation in progress…')
        recordEvent({ event: 'install started', timestamp: Date.now() })
        break

      case 'install completed':
        recordEvent({ event: 'install completed', timestamp: Date.now() })
        setLifecycle('normal', 'Installation completed')
        break

      case 'transfer status':
        if (message.args && message.args[0]) {
          const payload = parseJson<{ progress?: number; status?: string; message?: string }>(message.args[0])
          setLifecycle('transferring', payload?.message ?? payload?.status ?? 'Transfer in progress…', payload?.progress)
          recordEvent({ event: 'transfer status', raw: message.args[0], timestamp: Date.now() })
        }
        break

      case 'transfer logs':
        if (message.args && message.args[0]) {
          recordEvent({ event: 'transfer logs', raw: message.args[0], timestamp: Date.now() })
        }
        break

      case 'backup restore completed':
        if (message.args && message.args[0]) {
          const payload = parseJson<{ successful?: boolean; message?: string }>(message.args[0])
          if (payload?.successful === false) {
            setLifecycle('error', payload.message ?? 'Backup restore failed')
          }
          else {
            setLifecycle('normal', 'Backup restore finished')
          }
        }
        else {
          setLifecycle('normal', 'Backup restore finished')
        }
        recordEvent({ event: 'backup restore completed', raw: message.args?.[0], timestamp: Date.now() })
        break

      case 'backup completed':
        setLifecycle('normal', 'Backup completed')
        recordEvent({ event: 'backup completed', raw: message.args?.[0], timestamp: Date.now() })
        break

      case 'stats':
        if (message.args && message.args[0]) {
          handleStats(message.args[0])
        }
        break

      case 'token expiring':
        void refreshToken(false)
        break

      case 'token expired':
        connected.value = false
        void refreshToken(true)
        break

      default:
        if (message.event) {
          console.debug('Unhandled Wings socket event:', message.event, message.args)
          recordEvent({ event: message.event, raw: message.args?.join('\n'), timestamp: Date.now() })
        }
    }
  }

  const handleOpen = () => {
    sendAuthenticate(currentToken.value)
  }

  const handleError = (event: Event) => {
    console.error('WebSocket error', event)
    error.value = 'WebSocket connection error'
  }

  const handleClose = () => {
    socket.value = null
    connected.value = false
    connecting.value = false

    if (disposed) {
      return
    }

    if (reconnectAfterClose) {
      reconnectAfterClose = false
      scheduleReconnect(0)
    }
    else if (!intentionalClose) {
      scheduleReconnect()
    }

    intentionalClose = false
  }

  const attachSocketHandlers = (ws: WebSocket) => {
    ws.onopen = () => {
      connecting.value = false
      handleOpen()
    }

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        handleMessage(message)
      }
      catch (err) {
        console.error('Failed to parse Wings message:', err)
      }
    }

    ws.onerror = handleError
    ws.onclose = handleClose
  }

  const refreshToken = async (forceReconnect: boolean) => {
    if (tokenRefreshInFlight.value) {
      return
    }

    tokenRefreshInFlight.value = true
    try {
      const credentials = await fetchCredentials()
      currentToken.value = credentials.token

      if (currentSocketUrl.value && currentSocketUrl.value !== credentials.socket) {
        currentSocketUrl.value = credentials.socket
        reconnect()
        return
      }

      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        sendAuthenticate(credentials.token)
      }
      else if (forceReconnect) {
        reconnect()
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to refresh WebSocket token'
      if (forceReconnect) {
        reconnect()
      }
    }
    finally {
      tokenRefreshInFlight.value = false
    }
  }

  const connect = async () => {
    if (connecting.value || disposed) {
      return
    }

    connecting.value = true
    clearReconnectTimer()
    connected.value = false

    try {
      const credentials = await fetchCredentials()
      currentToken.value = credentials.token
      currentSocketUrl.value = credentials.socket

      if (socket.value) {
        intentionalClose = true
        reconnectAfterClose = false
        socket.value.close()
      }

      const wsUrl = `${credentials.socket}?token=${credentials.token}`
      const ws = new WebSocket(wsUrl)
      socket.value = ws
      attachSocketHandlers(ws)
    }
    catch (err) {
      connecting.value = false
      error.value = err instanceof Error ? err.message : 'Failed to establish WebSocket'
      scheduleReconnect()
    }
  }

  const disconnect = (reconnectSoon = false) => {
    clearReconnectTimer()
    reconnectAfterClose = reconnectSoon
    intentionalClose = !reconnectSoon

    if (socket.value) {
      socket.value.close()
    }

    if (!reconnectSoon) {
      socket.value = null
      connected.value = false
    }
  }

  const reconnect = () => {
    if (socket.value) {
      disconnect(true)
    }
    else {
      clearReconnectTimer()
      scheduleReconnect(0)
    }
  }

  const sendCommand = (command: string) => {
    if (!command.trim()) {
      return
    }
    send('send command', [command])
  }

  const sendPowerAction = (action: string) => {
    send('set state', [action])
  }

  void connect()

  onUnmounted(() => {
    disposed = true
    clearReconnectTimer()
    disconnect(false)
  })

  return {
    connected,
    connecting,
    serverState,
    stats,
    statsHistory,
    logs,
    error,
    sendCommand,
    sendPowerAction,
    reconnect,
    lifecycleStatus,
    lifecycleMessage,
    lifecycleProgress,
    recentEvents,
  }
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  }
  catch (error) {
    console.warn('Failed to parse JSON payload', error)
    return null
  }
}
