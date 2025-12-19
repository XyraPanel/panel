import type { BaseActivityEvent } from './audit'
import type { AdminUserResponse } from './api'
import type { Allocation } from './server'
import type { StoredWingsNode, WingsSystemInformation } from './wings'
import type { Nest, Egg, EggVariable } from './nest'

export interface AuditEventResponse extends BaseActivityEvent {
  target: string
  details: Record<string, unknown>
  actorDisplay?: string
  actorUserId?: string
  actorEmail?: string
}

export interface AuditEventsPagination {
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export interface AuditEventsPayload {
  data: AuditEventResponse[]
  pagination: AuditEventsPagination
}

export type AdminActivityEntry = AuditEventResponse


export interface AdminScheduleResponse {
  id: string
  name: string
  description?: string
  serverName: string
  cron: string
  nextRun: string | null
  lastRun: string | null
  enabled: boolean
  type?: 'wings' | 'nitro'
}

export interface NitroTasksResponse {
  tasks: Record<string, { description?: string }>
  scheduledTasks: Array<{ cron: string; tasks: string[] }>
}

export interface NitroTaskSchedule {
  name: string
  cron: string
  description?: string
  tasks: string[]
  type: 'nitro'
}

export interface AdminSchedulesPayload {
  data: AdminScheduleResponse[]
}

export interface AdminUsersPayload {
  data: AdminUserResponse[]
  pagination?: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export interface AdminUserProfileUser {
  id: string
  username: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  language: string
  role: string
  rootAdmin: boolean
  twoFactorEnabled: boolean
  emailVerified: boolean
  emailVerifiedAt: string | null
  suspended: boolean
  suspendedAt: string | null
  suspensionReason: string | null
  passwordResetRequired: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminUserServerSummary {
  id: string
  uuid: string
  identifier: string
  name: string
  status: string | null
  suspended: boolean
  nodeName: string | null
  createdAt: string
}

export interface AdminUserApiKeySummary {
  id: string
  identifier: string
  memo: string | null
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface PaginatedServersResponse {
  data: AdminUserServerSummary[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export interface PaginatedApiKeysResponse {
  data: AdminUserApiKeySummary[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export interface PaginatedActivityResponse {
  data: AdminActivityEntry[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export interface AdminUserProfilePayload {
  user: AdminUserProfileUser
  stats: {
    serverCount: number
    apiKeyCount: number
  }
  servers: AdminUserServerSummary[]
  apiKeys: AdminUserApiKeySummary[]
  activity: AdminActivityEntry[]
  security: {
    sessions: Array<{
      sessionToken: string
      expiresAt: string | null
      ipAddress: string | null
      lastSeenAt: string | null
      userAgent: string | null
    }>
    lastLogin: string | null
    lastLoginIp: string | null
    uniqueIps: string[]
    activeSessions: number
    securityEvents: Array<{
      id: string
      occurredAt: string
      action: string
      details: Record<string, unknown>
    }>
  }
}

export interface AdminRemoteServerRow {
  uuid: string
  identifier: string
  node: string
  name: string
  status: string | null
  players: string | null
}


export interface ApiKey {
  id: string
  identifier: string
  memo: string | null
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface ApiKeyWithToken extends ApiKey {
  apiKey: string
}

export type PermissionAction = 'read' | 'write' | 'delete'

export interface ApiKeyPermissions {
  servers?: PermissionAction[]
  nodes?: PermissionAction[]
  allocations?: PermissionAction[]
  users?: PermissionAction[]
  locations?: PermissionAction[]
  nests?: PermissionAction[]
  eggs?: PermissionAction[]
  databaseHosts?: PermissionAction[]
  serverDatabases?: PermissionAction[]
}

export interface CreateApiKeyPayload {
  memo?: string
  allowedIps?: string[]
  expiresAt?: string
  permissions?: ApiKeyPermissions
}

export interface ApiKeysResponse {
  data: ApiKey[]
}

export interface CreateApiKeyResponse {
  id: string
  identifier: string
  apiKey: string
  memo: string | null
  createdAt: string
}


export type NodeStatus = 'online' | 'maintenance' | 'unknown'

export interface DashboardMetric {
  key: string
  label: string
  value: number
  icon: string
  helper: string | null
}

export interface DashboardNode {
  id: string
  name: string
  fqdn: string
  allowInsecure: boolean
  maintenanceMode: boolean
  lastSeenAt: string | null
  serverCount: number | null
  status: NodeStatus
  issue: string | null
}

export interface DashboardIncident {
  id: string
  occurredAt: string
  actor: string
  actorUsername?: string
  action: string
  target: string | null
  metadata: Record<string, unknown> | null
}

export interface DashboardOperation {
  key: string
  label: string
  detail: string
}

export interface DashboardResponse {
  metrics: DashboardMetric[]
  nodes: DashboardNode[]
  incidents: DashboardIncident[]
  operations: DashboardOperation[]
  generatedAt: string
}


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

  databases?: number
  allocations?: number
  backups?: number

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

export type ServerAction =
  | 'suspend'
  | 'unsuspend'
  | 'reinstall'
  | 'delete'
  | 'start'
  | 'stop'
  | 'restart'
  | 'kill'

export interface ServerActionPayload {
  action: ServerAction
}

export interface ServerActionResponse {
  success: boolean
  message: string
}


export interface GeneralSettings {
  locale: string
  timezone: string
  showBrandLogo: boolean
  brandLogoUrl: string | null
  customCss?: string
  paginationLimit: number
  telemetryEnabled: boolean
}

export interface MailSettings {
  driver: string
  service: string
  host: string
  port: string
  username: string
  password: string
  encryption: string
  fromAddress: string
  fromName: string
}

export interface SecuritySettings {
  enforceTwoFactor: boolean
  maintenanceMode: boolean
  maintenanceMessage: string
  announcementEnabled: boolean
  announcementMessage: string
  sessionTimeoutMinutes: number
  queueConcurrency: number
  queueRetryLimit: number
}


export interface AdminWingsNodeAllocationSummary {
  id: string
  ip: string
  port: number
  isPrimary: boolean
  serverId: string | null
  serverName: string
  serverIdentifier: string
}

export interface AdminWingsNodeServerSummary {
  id: string
  uuid: string
  identifier: string
  name: string
  createdAt: string
  updatedAt: string
  primaryAllocation?: {
    ip: string
    port: number
  } | null
}

export interface AdminWingsNodeStats {
  serversTotal: number
  allocationsTotal: number
  maintenanceMode: boolean
  memoryProvisioned: number
  diskProvisioned: number
  lastSeenAt: string | null
}

export interface AdminWingsNodeDetail {
  node: StoredWingsNode
  stats: AdminWingsNodeStats
  recentServers: AdminWingsNodeServerSummary[]
  allocations: AdminWingsNodeAllocationSummary[]
  system?: WingsSystemInformation | null
  systemError?: string | null
}

export interface AdminPaginatedMeta {
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export interface AdminWingsNodeServersPayload {
  data: AdminWingsNodeServerSummary[]
  pagination: AdminPaginatedMeta
}

export interface AdminWingsNodeAllocationsPayload {
  data: AdminWingsNodeAllocationSummary[]
  pagination: AdminPaginatedMeta
}

export interface AdminNodeAllocationsResponse {
  data: Allocation[]
}

export interface UpdateWingsNodePayload {
  name?: string
  description?: string
  fqdn?: string
  scheme?: string
  public?: boolean
  maintenanceMode?: boolean
  behindProxy?: boolean
  memory?: number
  memoryOverallocate?: number
  disk?: number
  diskOverallocate?: number
  uploadSize?: number
  daemonListen?: number
  daemonSftp?: number
  daemonBase?: string
}

export interface UpdateWingsNodeResponse {
  data: StoredWingsNode
}


export interface EggImportData {
  name: string
  author?: string
  description?: string
  docker_images?: Record<string, string>
  startup?: string
  config?: {
    files?: Record<string, unknown>
    startup?: Record<string, unknown>
    logs?: Record<string, unknown>
    stop?: string
  }
  scripts?: {
    installation?: {
      script?: string
      container?: string
      entrypoint?: string
    }
  }
  variables?: Array<{
    name: string
    description?: string
    env_variable: string
    default_value?: string
    user_viewable?: boolean
    user_editable?: boolean
    rules?: string
  }>
}

export interface EggImportResponse {
  success: boolean
  data: {
    id: string
  }
}


export interface NestWithEggCount extends Nest {
  eggCount: number
}

export interface CreateNestPayload {
  author: string
  name: string
  description?: string
}

export interface UpdateNestPayload {
  author?: string
  name?: string
  description?: string
}

export interface EggWithVariables extends Egg {
  variables: EggVariable[]
}

export interface CreateEggPayload {
  nestId: string
  author: string
  name: string
  description?: string
  dockerImage: string
  dockerImages?: string[]
  startup: string
  configFiles?: Record<string, unknown>
  configStartup?: Record<string, unknown>
  configStop?: string
  configLogs?: Record<string, unknown>
  scriptContainer?: string
  scriptEntry?: string
  scriptInstall?: string
  copyScriptFrom?: string
}

export interface UpdateEggPayload {
  author?: string
  name?: string
  description?: string
  dockerImage?: string
  dockerImages?: string[]
  startup?: string
  configFiles?: Record<string, unknown>
  configStartup?: Record<string, unknown>
  configStop?: string
  configLogs?: Record<string, unknown>
  scriptContainer?: string
  scriptEntry?: string
  scriptInstall?: string
  copyScriptFrom?: string
}

export interface CreateEggVariablePayload {
  eggId: string
  name: string
  description?: string
  envVariable: string
  defaultValue?: string
  userViewable?: boolean
  userEditable?: boolean
  rules?: string
}

export interface UpdateEggVariablePayload {
  name?: string
  description?: string
  envVariable?: string
  defaultValue?: string
  userViewable?: boolean
  userEditable?: boolean
  rules?: string
}


export interface Location {
  id: string
  short: string
  long: string | null
  createdAt: string
  updatedAt: string
}

export interface LocationWithNodeCount extends Location {
  nodeCount: number
}

export interface CreateLocationPayload {
  short: string
  long?: string
}

export interface UpdateLocationPayload {
  short?: string
  long?: string
}


export interface AdminMount {
  id: string
  uuid: string
  name: string
  description: string | null
  source: string
  target: string
  readOnly: boolean
  userMountable: boolean
  createdAt: string
  updatedAt: string
}

export interface MountWithRelations extends AdminMount {
  eggs: string[]
  nodes: string[]
  servers: string[]
}

export interface CreateMountPayload {
  name: string
  description?: string
  source: string
  target: string
  readOnly?: boolean
  userMountable?: boolean
  eggs?: string[]
  nodes?: string[]
}

export interface UpdateMountPayload {
  name?: string
  description?: string
  source?: string
  target?: string
  readOnly?: boolean
  userMountable?: boolean
  eggs?: string[]
  nodes?: string[]
}


export interface DatabaseHost {
  id: string
  name: string
  hostname: string
  port: number
  username: string | null
  password: string | null
  database: string | null
  nodeId: string | null
  maxDatabases: number | null
  createdAt: string
  updatedAt: string
}

export interface DatabaseHostWithStats extends DatabaseHost {
  databaseCount: number
  nodeName?: string
}

export interface CreateDatabaseHostPayload {
  name: string
  hostname: string
  port?: number
  username: string
  password: string
  database?: string
  nodeId?: string
  maxDatabases?: number
}

export interface UpdateDatabaseHostPayload {
  name?: string
  hostname?: string
  port?: number
  username?: string
  password?: string
  database?: string
  nodeId?: string
  maxDatabases?: number
}

export interface TestDatabaseConnectionPayload {
  hostname: string
  port: number
  username: string
  password: string
  database?: string
}


export interface AdminNavItem {
  id: string
  label: string
  to: string
  order?: number
  permission?: string | string[]
}

export type AdminNavItems = AdminNavItem[]

export interface SuspensionBody {
  action: 'suspend' | 'unsuspend' | 'ban' | 'unban'
  reason?: string | null
  banExpiresIn?: number | null
}

export interface ResetPasswordBody {
  mode?: 'link' | 'temporary'
  password?: string
  notify?: boolean
}
