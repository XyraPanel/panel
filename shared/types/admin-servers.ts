export interface ServerMeta {
  name: string
  identifier: string
  node: string
  status: string
  egg: string
  dockerImage: string
  lastSync: string
  uptime: string
}

export interface MetricRow {
  label: string
  value: string
}

export interface EnvVarRow {
  key: string
  value: string
}

export interface EventRow {
  at: string
  action: string
  actor: string
}

export interface AdminOpRow {
  label: string
  description: string
}

export interface ServerDetail {
  meta: ServerMeta
  usageMetrics: MetricRow[]
  environmentVars: EnvVarRow[]
  recentEvents: EventRow[]
  adminOps: AdminOpRow[]
}

export interface AdminServerDatabase {
  id: string
  database: string
  username: string
  host: string
  remote: string
}

export interface AdminServerDatabaseListResponse {
  data: AdminServerDatabase[]
}

export interface CreateServerPayload {
  name: string
  description?: string
  ownerId: string
  eggId: string
  nestId: string
  nodeId: string

  memory: number
  swap: number
  disk: number
  io: number
  cpu: number
  threads?: string

  allocationId: string
  additionalAllocations?: string[]

  startup: string
  environment: Record<string, string>

  dockerImage: string

  skipScripts?: boolean
  startOnCompletion?: boolean
  oomDisabled?: boolean
}

export interface ServerBuildConfiguration {
  memory: number
  swap: number
  disk: number
  io: number
  cpu: number
  threads?: string
  oomDisabled: boolean
}

export interface ServerStartupConfiguration {
  startup: string
  dockerImage: string
  environment: Record<string, string>
}

export interface UpdateAdminServerPayload {
  name?: string
  description?: string
  ownerId?: string
  externalId?: string
}
