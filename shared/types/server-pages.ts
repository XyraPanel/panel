export type AccentColor = 'primary' | 'neutral' | 'warning' | 'error'

export interface ServerBackupRow {
  name: string
  size: string
  createdAt: string
  storedAt: string
  status: 'Completed' | 'In progress'
}

export interface ServerFileNode {
  name: string
  type: 'directory' | 'file'
  size: string
  modified: string
  children?: ServerFileNode[]
  content?: string
}

export interface ServerFileListItem {
  name: string
  type: 'directory' | 'file'
  size: string
  modified: string
  path: string
}

export interface ServerFileEntry {
  name: string
  path: string
  size: number
  mode: string
  modeBits: string
  mime: string
  created: string
  modified: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

export interface ServerDirectoryListing {
  directory: string
  entries: ServerFileEntry[]
}

export interface ServerFileContentResponse {
  path: string
  content: string
}

export interface ServerAllocationRow {
  ip: string
  port: number
  description: string
}

export interface ServerAllocationSummary {
  ip: string
  port: number
  description: string
}

export interface ServerFirewallRule {
  label: string
  protocol: 'tcp' | 'udp'
  ports: string
  action: 'allow' | 'deny'
  summary: string
}

export interface ServerScheduleTask {
  name: string
  cron: string
  action: string
  nextRun: string
  status: 'Enabled' | 'Paused'
}

export interface ServerEnvVarRow {
  key: string
  value: string
  description: string
}

export interface ServerStartupMatcher {
  name: string
  matcher: string
  description: string
}

export interface ServerUserRow {
  username: string
  permissions: string[]
  lastAccess: string
  status: 'Accepted' | 'Pending'
}

export interface ServerLimitSummary {
  cpu: string
  memory: string
  disk: string
  swap: string
  io: string
}

export interface ServerFeatureToggle {
  label: string
  binding: string
  value: boolean
}

export interface ServerSuspensionInfo {
  suspended: boolean
  reason: string
}

export interface PanelServerDetails {
  id: string
  uuid: string
  identifier: string
  name: string
  description: string | null
  status: string | null
  suspended: boolean
  node: {
    id: string | null
    name: string | null
  }
  limits: {
    memory: number | null
    disk: number | null
    cpu: number | null
    swap: number | null
    io: number | null
  }
  createdAt: string
  allocations: {
    primary: ServerAllocationSummary | null
    additional: ServerAllocationSummary[]
  }
  owner: {
    id: string | null
    username: string | null
  }
}
