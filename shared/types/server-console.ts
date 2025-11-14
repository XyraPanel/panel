export type PowerAction = 'start' | 'stop' | 'restart' | 'kill'

export interface ServerStats {
  memoryBytes: number
  memoryLimitBytes: number
  cpuAbsolute: number
  networkRxBytes: number
  networkTxBytes: number
  uptime: number
  state: ServerState
  diskBytes: number
}

export type ServerState = 'offline' | 'starting' | 'running' | 'stopping'

export interface ServerStatsHistoryEntry {
  timestamp: number
  stats: ServerStats
}

export type ServerStatsHistory = ServerStatsHistoryEntry[]

export interface ConsoleLog {
  timestamp: string
  message: string
}

export interface WebSocketMessage {
  event: string
  args?: string[]
}

export interface PowerActionRequest {
  action: PowerAction
  waitSeconds?: number
}

export interface ServerCommandPayload {
  command: string
}

export interface ServerFileDeletePayload {
  root: string
  files: string[]
}

export interface ServerFileWritePayload {
  file: string
  content: string
}

export interface ServerFileCompressPayload {
  root: string
  files: string[]
}

export interface ServerFileDecompressPayload {
  root: string
  file: string
}

export interface ServerStatsChartProps {
  stats: ServerStats | null
  history: ServerStatsHistory
}

export interface ServerTerminalProps {
  logs: string[]
  connected: boolean
}
