import type { Pagination, ActorType, TargetType } from './audit';
import type { SessionUser } from './auth';
import type { StoredWingsNode } from './wings';

export interface Server {
  id: string;
  uuid: string;
  identifier: string;
  externalId: string | null;
  name: string;
  description: string | null;
  status: string | null;
  suspended: boolean;
  skipScripts: boolean;
  ownerId: string | null;
  nodeId: string | null;
  allocationId: string | null;
  nestId: string | null;
  eggId: string | null;
  startup: string | null;
  image: string | null;
  allocationLimit: number | null;
  databaseLimit: number | null;
  backupLimit: number;
  installedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ServerWithLimits extends Server {
  limits: ServerLimits | null;
}

export type ServerInfo = Pick<
  Server,
  'id' | 'uuid' | 'identifier' | 'name' | 'description' | 'suspended'
>;

export interface ServerListEntry extends Pick<
  Server,
  'uuid' | 'identifier' | 'name' | 'description' | 'suspended'
> {
  nodeId: string;
  nodeName: string;
  limits: Record<string, unknown> | null;
  featureLimits: Record<string, unknown> | null;
  status: string;
  ownership: 'mine' | 'shared';
  isTransferring?: boolean;
  primaryAllocation?: string | null;
}

export interface ServersResponse {
  data: ServerListEntry[];
  generatedAt: string;
}

export interface ServerLimits {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  swap: number | null;
  io: number | null;
  threads: string | null;
  oomDisabled: boolean;
  databaseLimit: number | null;
  allocationLimit: number | null;
  backupLimit: number | null;
}

export interface ServerResponse {
  data: Server;
}

export interface AdminServerDetails extends Server {
  owner?: {
    id: string;
    username: string;
    email: string;
  } | null;
  node?: {
    id: string;
    uuid: string;
    name: string;
    fqdn: string;
  } | null;
  egg?: {
    id: string;
    uuid: string;
    name: string;
    startup?: string | null;
    dockerImages?: Record<string, string>;
  } | null;
  environment?: Record<string, string>;
  nest?: {
    id: string;
    uuid: string;
    name: string;
  } | null;
  allocation?: {
    id: string;
    ip: string;
    port: number;
  } | null;
  allocations?: Array<{
    id: string;
    ip: string;
    port: number;
    is_primary: boolean;
  }>;
  limits?: ServerLimits | null;
}

export interface AdminServerResponse {
  data: AdminServerDetails;
}

export interface ServerLimitsResponse {
  data: ServerLimits;
}

export interface ServerRequestContext<TServer = unknown> {
  user: SessionUser;
  server: TServer;
  permissions: string[];
  isAdmin: boolean;
  isOwner: boolean;
  subuserPermissions: string[] | null;
  node: StoredWingsNode | null;
  nodeConnection: {
    tokenId: string;
    tokenSecret: string;
    combinedToken: string;
  } | null;
}

export interface ServerAccessOptions {
  identifier?: string;
  requireNode?: boolean;
  requiredPermissions?: string[];
  fallbackPermissions?: string[];
}

export const ADMIN_PERMISSIONS = [
  'control.console',
  'control.start',
  'control.stop',
  'control.restart',
  'websocket.connect',
  'admin.websocket.errors',
  'admin.websocket.install',
  'admin.websocket.transfer',
  'file.read',
  'file.write',
  'file.delete',
  'file.rename',
  'file.download',
  'file.upload',
  'file.copy',
  'file.create',
  'file.chmod',
  'file.compress',
  'file.decompress',
  'file.pull',
];

export const DEFAULT_SUBUSER_PERMISSIONS = [
  'control.console',
  'control.start',
  'control.stop',
  'control.restart',
  'websocket.connect',
  'file.read',
  'file.write',
  'file.download',
  'file.upload',
  'file.copy',
];

export interface GetUserPermissionsOptions {
  isAdmin?: boolean;
  isOwner?: boolean;
  subuserPermissions?: string[] | null;
}

export type Permission =
  | 'server.view'
  | 'server.console'
  | 'server.power'
  | 'server.command'
  | 'server.files.read'
  | 'server.files.write'
  | 'server.files.delete'
  | 'server.files.upload'
  | 'server.files.download'
  | 'server.files.compress'
  | 'server.backup.create'
  | 'server.backup.restore'
  | 'server.backup.delete'
  | 'server.backup.download'
  | 'server.database.create'
  | 'server.database.read'
  | 'server.database.update'
  | 'server.database.delete'
  | 'server.schedule.create'
  | 'server.schedule.read'
  | 'server.schedule.update'
  | 'server.schedule.delete'
  | 'server.settings.read'
  | 'server.settings.update'
  | 'server.users.read'
  | 'server.users.create'
  | 'server.users.update'
  | 'server.users.delete'
  | 'server.files.*'
  | 'server.backup.*'
  | 'server.database.*'
  | 'server.schedule.*'
  | 'server.users.*'
  | 'control.console'
  | 'control.start'
  | 'control.stop'
  | 'control.restart'
  | 'control.power'
  | 'user.create'
  | 'user.read'
  | 'user.update'
  | 'user.delete'
  | 'file.create'
  | 'file.read'
  | 'file.update'
  | 'file.delete'
  | 'file.archive'
  | 'file.sftp'
  | 'backup.create'
  | 'backup.read'
  | 'backup.delete'
  | 'backup.download'
  | 'backup.restore'
  | 'allocation.read'
  | 'allocation.create'
  | 'allocation.update'
  | 'allocation.delete'
  | 'startup.read'
  | 'startup.update'
  | 'database.create'
  | 'database.read'
  | 'database.update'
  | 'database.delete'
  | 'database.view_password'
  | 'schedule.create'
  | 'schedule.read'
  | 'schedule.update'
  | 'schedule.delete'
  | 'settings.rename'
  | 'settings.reinstall'
  | 'websocket.connect'
  | 'admin.*'
  | 'admin.servers.*'
  | 'admin.users.*'
  | 'admin.nodes.*'
  | 'admin.locations.*'
  | 'admin.nests.*'
  | 'admin.eggs.*'
  | 'admin.mounts.*'
  | 'admin.settings.*';

export interface PermissionCheck {
  hasPermission: boolean;
  reason?: string;
}

export interface UserPermissions {
  userId: string;
  isAdmin: boolean;
  serverPermissions: Map<string, Permission[]>;
}

export interface PermissionMiddlewareOptions {
  requiredPermissions: Permission[];
  serverId?: string;
  allowOwner?: boolean;
  allowAdmin?: boolean;
}

export interface PermissionContext {
  userId: string;
  isAdmin: boolean;
  isOwner: boolean;
  hasPermissions: boolean;
  missingPermissions: Permission[];
}

export type PowerAction = 'start' | 'stop' | 'restart' | 'kill';

export interface ServerStats {
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptime: number;
  state: ServerState;
  diskBytes: number;
}

export type ServerState = 'offline' | 'starting' | 'running' | 'stopping' | 'stopped';

export interface ServerStatsHistoryEntry {
  timestamp: number;
  stats: ServerStats;
}

export type ServerStatsHistory = ServerStatsHistoryEntry[];

export interface ConsoleLog {
  timestamp: string;
  message: string;
}

export interface PowerActionRequest {
  action: PowerAction;
  waitSeconds?: number;
}

export interface ServerCommandPayload {
  command: string;
}

export interface ServerFileDeletePayload {
  root: string;
  files: string[];
}

export interface ServerFileWritePayload {
  file: string;
  content: string;
}

export interface ServerFileCompressPayload {
  root: string;
  files: string[];
}

export interface ServerFileDecompressPayload {
  root: string;
  file: string;
}

export interface ServerStatsChartProps {
  stats: ServerStats | null;
  history: ServerStatsHistory;
}

export interface ServerTerminalProps {
  logs: string[];
  connected: boolean;
  serverId?: string;
}

export interface ServerStatus {
  serverId: string;
  serverUuid: string;
  state: string;
  isOnline: boolean;
  isSuspended: boolean;
  utilization?: {
    memory_bytes: number;
    memory_limit_bytes: number;
    cpu_absolute: number;
    network: {
      rx_bytes: number;
      tx_bytes: number;
    };
    uptime: number;
    disk_bytes: number;
  };
  lastChecked: Date;
  error?: string;
}

export interface ServerResourceStats {
  serverId: string;
  serverUuid: string;
  state: string;
  isSuspended: boolean;
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptime: number;
  lastUpdated: Date;
}

export type NodeHealthStatus = 'online' | 'offline' | 'maintenance' | 'unknown';

export interface NodeResourceStats {
  nodeId: string;
  totalMemory: number;
  usedMemory: number;
  totalDisk: number;
  usedDisk: number;
  cpuCount: number;
  cpuUsage: number;
  serverCount: number;
  lastUpdated: Date | null;
  status: NodeHealthStatus;
  message?: string | null;
}

export interface NodeResourceUsage {
  memory: number;
  disk: number;
  serverCount: number;
}

export interface BackupManagerOptions {
  userId?: string;
  skipAudit?: boolean;
}

export interface CreateBackupOptions extends BackupManagerOptions {
  name?: string;
  ignoredFiles?: string;
}

export interface BackupInfo {
  id: string;
  uuid: string;
  name: string;
  serverId: string;
  serverUuid: string;
  size: number;
  isSuccessful: boolean;
  isLocked: boolean;
  checksum?: string;
  ignoredFiles?: string;
  completedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface ServerBackup {
  id: string;
  serverId: string;
  uuid: string;
  name: string;
  ignoredFiles: string[];
  disk: 'wings' | 's3';
  checksum: string | null;
  bytes: number;
  isSuccessful: boolean;
  isLocked: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBackupPayload {
  name?: string;
  locked?: boolean;
}

export interface CreateBackupResponse {
  data: {
    id: string;
    uuid: string;
    name: string;
    isLocked: boolean;
    createdAt: string;
  };
}

export interface ServerDatabase {
  id: string;
  serverId: string;
  databaseHostId: string;
  name: string;
  username: string;
  remote: string;
  maxConnections: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  host: {
    hostname: string;
    port: number;
  };
}

export interface CreateServerDatabasePayload {
  name: string;
  remote: string;
}

export interface ServerDatabaseCredentials {
  id: string;
  name: string;
  username: string;
  password: string;
  host: {
    hostname: string;
    port: number;
  };
}

export interface ServerDatabaseCreateResponse {
  success: boolean;
  data: ServerDatabaseCredentials;
}

export interface ServerAllocation {
  id: string;
  serverId: string;
  ip: string;
  ipAlias: string | null;
  port: number;
  notes: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkData {
  primary: ServerAllocation | null;
  allocations: ServerAllocation[];
  allocation_limit: number | null;
}

export interface CreateServerAllocationPayload {
  allocationId: string;
}

export interface CreateServerAllocationResponse {
  success: boolean;
  data: {
    id: string;
    serverId: string;
    ip: string;
    port: number;
    isPrimary: boolean;
    createdAt: string;
  };
}

export interface ServerSchedule {
  id: string;
  serverId: string;
  name: string;
  cron: string;
  action: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServerSchedulePayload {
  name: string;
  cron: string;
  action: string;
  enabled?: boolean;
}

export interface ServerScheduleResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    cron: string;
    action: string;
    enabled: boolean;
  };
}

export interface UpdateServerSchedulePayload {
  name?: string;
  cron?: string;
  action?: string;
  enabled?: boolean;
}

export interface ServerStartupVariable {
  id: string;
  serverId: string;
  key: string;
  value: string;
  description: string | null;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StartupForm {
  startup: string;
  dockerImage: string;
  environment: Record<string, string>;
}

export interface EnvironmentEntry {
  key: string;
  value: string;
}

export type EnvironmentInputValue = string | number | boolean | null | undefined;

export interface UpdateStartupVariablePayload {
  value: string;
}

export interface UpdateStartupVariableResponse {
  success: boolean;
  data: ServerStartupVariable;
}

export interface ServerSubuser {
  id: string;
  serverId: string;
  userId: string;
  username: string;
  email: string;
  image: string | null;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateServerSubuserPayload {
  permissions: string[];
}

export interface UpdateServerSubuserResponse {
  success: boolean;
  data: ServerSubuser;
}

export interface CreateServerSubuserPayload {
  email: string;
  permissions: string[];
}

export interface CreateServerSubuserResponse {
  success: boolean;
  data: ServerSubuser;
}

export interface SettingsData {
  server: ServerInfo;
  limits: ServerLimits | null;
}

export interface RenameServerPayload {
  name: string;
}

export interface RenameServerResponse {
  success: boolean;
  data: {
    name: string;
  };
}

export interface ServerActivityEvent {
  id: string;
  occurredAt: string;
  actor: string;
  actorType: ActorType;
  action: string;
  targetType: TargetType;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actorDisplay?: string;
  actorEmail?: string;
}

export interface PaginatedServerActivityResponse {
  data: ServerActivityEvent[];
  pagination: Pagination;
  generatedAt: string;
}

export interface ServerTransferConfig {
  serverId: string;
  targetNodeId: string;
  targetAllocationId: string;
}

export type TransferState = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TransferStatus {
  id: string;
  status: TransferState;
  progress: number;
  message: string;
}

export interface TransferManagerOptions {
  userId?: string;
  skipAudit?: boolean;
}

export interface TransferInfo {
  id: string;
  serverId: string;
  serverUuid: string;
  oldNodeId: string;
  newNodeId: string;
  oldAllocationId: string;
  newAllocationId: string;
  oldAdditionalAllocations?: string[];
  newAdditionalAllocations?: string[];
  status: TransferState;
  successful?: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTransferOptions extends TransferManagerOptions {
  serverUuid: string;
  newNodeId: string;
  newAllocationId: string;
  newAdditionalAllocations?: string[];
}

export interface TransferValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TransferOptions {
  startOnCompletion?: boolean;
  allocationId?: string;
  additionalAllocationIds?: string[];
}

export interface TransferResult {
  transferId: string;
  server: {
    id: string;
    uuid: string;
    name: string | null;
  };
  sourceNodeId: string;
  targetNodeId: string;
  newAllocationId: string;
}

export interface TransferNotificationPayload {
  serverUuid: string;
  destination: {
    baseUrl: string;
    token: string;
  };
  startOnCompletion?: boolean;
}

export interface ServerProvisioningConfig {
  serverId: string;
  serverUuid: string;
  eggId: string;
  nodeId: string;
  allocationId: string;
  environment?: Record<string, string>;
  additionalAllocationIds?: string[];
  mountIds?: string[];
  dockerImageOverride?: string;
  skipScripts?: boolean;
  startOnCompletion?: boolean;
  dockerCredentials?: {
    registry?: string;
    username?: string;
    password?: string;
    imagePullPolicy?: string;
  };
}

export interface ServerProvisioningContext<
  TServer = unknown,
  TLimits = unknown,
  TEgg = unknown,
  TAllocation = unknown,
  TAdditionalAllocation = TAllocation,
  TEggVariable = unknown,
  TMount = unknown,
  TWingsNode = unknown,
> {
  wingsNode: TWingsNode;
  server: TServer;
  limits: TLimits;
  egg: TEgg;
  allocation: TAllocation;
  additionalAllocations: TAdditionalAllocation[];
  eggVariables: TEggVariable[];
  mounts: TMount[];
}

export interface ServerManagerOptions {
  userId?: string;
  skipAudit?: boolean;
}

export type AccentColor = 'primary' | 'neutral' | 'warning' | 'error';

export interface ServerBackupRow {
  name: string;
  size: string;
  createdAt: string;
  storedAt: string;
  status: 'Completed' | 'In progress';
}

export interface ServerFileNode {
  name: string;
  type: 'directory' | 'file';
  size: string;
  modified: string;
  children?: ServerFileNode[];
  content?: string;
}

export interface ServerFileListItem {
  name: string;
  type: 'directory' | 'file';
  size: string;
  modified: string;
  path: string;
  mode?: string;
}

export interface ServerFileEntry {
  name: string;
  path: string;
  size: number;
  mode: string;
  modeBits: string;
  mime: string;
  created: string;
  modified: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

export interface ServerDirectoryListing {
  directory: string;
  entries: ServerFileEntry[];
}

export interface ServerFileContentResponse {
  path: string;
  content: string;
}

export interface ServerAllocationRow {
  ip: string;
  port: number;
  description: string;
}

export interface ServerAllocationSummary {
  ip: string;
  port: number;
  description: string;
}

export interface ServerFirewallRule {
  label: string;
  protocol: 'tcp' | 'udp';
  ports: string;
  action: 'allow' | 'deny';
  summary: string;
}

export interface ServerScheduleTask {
  name: string;
  cron: string;
  action: string;
  nextRun: string;
  status: 'Enabled' | 'Paused';
}

export interface ServerEnvVarRow {
  key: string;
  value: string;
  description: string;
}

export interface ServerStartupMatcher {
  name: string;
  matcher: string;
  description: string;
}

export interface ServerUserRow {
  username: string;
  permissions: string[];
  lastAccess: string;
  status: 'Accepted' | 'Pending';
}

export interface ServerLimitSummary {
  cpu: string;
  memory: string;
  disk: string;
  swap: string;
  io: string;
}

export interface ServerFeatureToggle {
  label: string;
  binding: string;
  value: boolean;
}

export interface ServerSuspensionInfo {
  suspended: boolean;
  reason: string;
}

export interface PanelServerDetails {
  id: string;
  uuid: string;
  identifier: string;
  name: string;
  description: string | null;
  status: string | null;
  suspended: boolean;
  node: {
    id: string | null;
    name: string | null;
  };
  limits: {
    memory: number | null;
    disk: number | null;
    cpu: number | null;
    swap: number | null;
    io: number | null;
  };
  createdAt: string;
  allocations: {
    primary: ServerAllocationSummary | null;
    additional: ServerAllocationSummary[];
  };
  owner: {
    id: string | null;
    username: string | null;
  };
  permissions?: string[];
}

export interface Allocation {
  id: string;
  nodeId: string;
  serverId: string | null;
  ip: string;
  port: number;
  isPrimary: boolean;
  ipAlias: string | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface WingsAllocation {
  force_outgoing_ip: boolean;
  default: {
    ip: string;
    port: number;
  };
  mappings: Record<string, number[]>;
}

export interface ServerTransfer {
  id: string;
  serverId: string;
  oldNode: string;
  newNode: string;
  oldAllocation: string;
  newAllocation: string;
  oldAdditionalAllocations: string | null;
  newAdditionalAllocations: string | null;
  successful: boolean;
  archived: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface FileManagerOptions {
  userId?: string;
  skipAudit?: boolean;
}

export interface FileOperation {
  type:
    | 'create'
    | 'edit'
    | 'delete'
    | 'rename'
    | 'copy'
    | 'move'
    | 'chmod'
    | 'compress'
    | 'decompress';
  path: string;
  newPath?: string;
  content?: string;
  permissions?: string;
  files?: string[];
}

export interface FileUploadResult {
  success: boolean;
  uploadUrl?: string;
  error?: string;
}

export type TaskAction = 'command' | 'power' | 'backup';

export interface ScheduleTask {
  id: string;
  action: TaskAction;
  payload: string;
  timeOffset: number;
  sequenceId: number;
  continueOnFailure: boolean;
  isQueued: boolean;
}

export interface ScheduleInfo {
  id: string;
  serverId: string;
  serverUuid: string;
  name: string;
  cron: string;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  tasks: ScheduleTask[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
  executedAt: Date;
}

export interface ScheduleExecutionResult {
  scheduleId: string;
  success: boolean;
  tasks: TaskExecutionResult[];
  executedAt: Date;
}

export interface BackupRemoteUploadResponse {
  parts: string[];
  part_size: number;
}

export interface RestoreStatusRequest {
  successful: boolean;
}

export interface CommandBody {
  command: string;
}

export interface CreateDatabaseBody {
  name: string;
  remote: string;
}
