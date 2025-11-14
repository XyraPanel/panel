import { sqliteTable, text, integer, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    password: text('password').notNull(),
    nameFirst: text('name_first'),
    nameLast: text('name_last'),
    language: text('language').notNull().default('en'),
    rootAdmin: integer('root_admin', { mode: 'boolean' }).notNull().default(false),
    role: text('role').notNull().default('user'),
    emailVerified: integer('email_verified', { mode: 'timestamp' }),
    image: text('image'),

    useTotp: integer('use_totp', { mode: 'boolean' }).notNull().default(false),
    totpSecret: text('totp_secret'),
    totpAuthenticatedAt: integer('totp_authenticated_at', { mode: 'timestamp' }),
    rememberToken: text('remember_token'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    usernameUnique: uniqueIndex('users_username_unique').on(table.username),
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
)

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    refreshTokenExpiresIn: integer('refresh_token_expires_in'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
    oauthTokenSecret: text('oauth_token_secret'),
    oauthToken: text('oauth_token'),
  },
  (table) => ({
    providerProviderAccountIdIndex: uniqueIndex('accounts_provider_provider_account_id_index').on(table.provider, table.providerAccountId),
  }),
)

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    tokenIdentifierIndex: uniqueIndex('verification_token_identifier_token_index').on(table.identifier, table.token),
    compositePk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
)

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    short: text('short').notNull(),
    long: text('long'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    shortUnique: uniqueIndex('locations_short_unique').on(table.short),
  }),
)

export const wingsNodes = sqliteTable(
  'wings_nodes',
  {
    id: text('id').primaryKey(),
    uuid: text('uuid').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    baseUrl: text('base_url').notNull(),
    fqdn: text('fqdn').notNull(),
    scheme: text('scheme').notNull(),
    public: integer('public', { mode: 'boolean' }).notNull().default(true),
    maintenanceMode: integer('maintenance_mode', { mode: 'boolean' }).notNull().default(false),
    allowInsecure: integer('allow_insecure', { mode: 'boolean' }).notNull().default(false),
    behindProxy: integer('behind_proxy', { mode: 'boolean' }).notNull().default(false),
    memory: integer('memory').notNull(),
    memoryOverallocate: integer('memory_overallocate').notNull().default(0),
    disk: integer('disk').notNull(),
    diskOverallocate: integer('disk_overallocate').notNull().default(0),
    uploadSize: integer('upload_size').notNull().default(100),
    daemonBase: text('daemon_base').notNull(),
    daemonListen: integer('daemon_listen').notNull().default(8080),
    daemonSftp: integer('daemon_sftp').notNull().default(2022),
    tokenIdentifier: text('token_identifier').notNull(),
    tokenSecret: text('token_secret').notNull(),
    apiToken: text('api_token').notNull(),
    locationId: text('location_id').references(() => locations.id),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    baseUrlUnique: uniqueIndex('wings_nodes_base_url_unique').on(table.baseUrl),
    uuidUnique: uniqueIndex('wings_nodes_uuid_unique').on(table.uuid),
  }),
)

export const serverAllocations = sqliteTable(
  'server_allocations',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id').notNull().references(() => wingsNodes.id, { onDelete: 'cascade' }),
    serverId: text('server_id'),
    ip: text('ip').notNull(),
    port: integer('port').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    ipAlias: text('ip_alias'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    allocationNodeIndex: uniqueIndex('server_allocations_unique').on(table.nodeId, table.ip, table.port),
  }),
)

export const servers = sqliteTable(
  'servers',
  {
    id: text('id').primaryKey(),
    uuid: text('uuid').notNull(),
    identifier: text('identifier').notNull(),
    externalId: text('external_id'),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status'),
    suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
    skipScripts: integer('skip_scripts', { mode: 'boolean' }).notNull().default(false),
    ownerId: text('owner_id').references(() => users.id),
    nodeId: text('node_id').references(() => wingsNodes.id),
    allocationId: text('allocation_id').references(() => serverAllocations.id),
    nestId: text('nest_id').references(() => nests.id),
    eggId: text('egg_id').references(() => eggs.id),
    startup: text('startup'),
    image: text('image'),
    dockerImage: text('docker_image'),
    allocationLimit: integer('allocation_limit'),
    databaseLimit: integer('database_limit'),
    backupLimit: integer('backup_limit').notNull().default(0),
    oomDisabled: integer('oom_disabled', { mode: 'boolean' }).notNull().default(true),
    installedAt: integer('installed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    uuidUnique: uniqueIndex('servers_uuid_unique').on(table.uuid),
    identifierUnique: uniqueIndex('servers_identifier_unique').on(table.identifier),
    externalIdUnique: uniqueIndex('servers_external_id_unique').on(table.externalId),
  }),
)

export const serverLimits = sqliteTable('server_limits', {
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  cpu: integer('cpu'),
  memory: integer('memory'),
  disk: integer('disk'),
  swap: integer('swap'),
  io: integer('io'),
  threads: text('threads'),
  oomDisabled: integer('oom_disabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const serverStartupEnv = sqliteTable(
  'server_startup_env',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    isEditable: integer('is_editable', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    envKeyUnique: uniqueIndex('server_env_key_unique').on(table.serverId, table.key),
  }),
)

export const serverEnvironmentVariables = serverStartupEnv

export const serverSchedules = sqliteTable(
  'server_schedules',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cron: text('cron').notNull(),
    action: text('action').notNull(),
    nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
    lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
)

export const serverScheduleTasks = sqliteTable(
  'server_schedule_tasks',
  {
    id: text('id').primaryKey(),
    scheduleId: text('schedule_id').notNull().references(() => serverSchedules.id, { onDelete: 'cascade' }),
    sequenceId: integer('sequence_id').notNull(),
    action: text('action').notNull(),
    payload: text('payload'),
    timeOffset: integer('time_offset').notNull().default(0),
    continueOnFailure: integer('continue_on_failure', { mode: 'boolean' }).notNull().default(false),
    isQueued: integer('is_queued', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    uniqueSequence: uniqueIndex('server_schedule_tasks_sequence').on(table.scheduleId, table.sequenceId),
  }),
)

export const databaseHosts = sqliteTable(
  'database_hosts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    hostname: text('hostname').notNull(),
    port: integer('port').notNull().default(3306),
    username: text('username'),
    password: text('password'),
    database: text('database'),
    nodeId: text('node_id').references(() => wingsNodes.id),
    maxDatabases: integer('max_databases'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
)

export const serverDatabases = sqliteTable(
  'server_databases',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    databaseHostId: text('database_host_id').notNull().references(() => databaseHosts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    username: text('username').notNull(),
    password: text('password').notNull(),
    remote: text('remote').notNull(),
    maxConnections: integer('max_connections'),
    status: text('status').notNull().default('ready'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    uniqueNamePerServer: uniqueIndex('server_databases_unique_name_per_server').on(table.serverId, table.name),
  }),
)

export const serverSubusers = sqliteTable(
  'server_subusers',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    permissions: text('permissions').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    uniqueUserPerServer: uniqueIndex('server_subusers_unique_user_per_server').on(table.serverId, table.userId),
  }),
)

export const serverBackups = sqliteTable(
  'server_backups',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    uuid: text('uuid').notNull(),
    name: text('name').notNull(),
    ignoredFiles: text('ignored_files'),
    disk: text('disk').notNull().default('wings'),
    checksum: text('checksum'),
    bytes: integer('bytes').notNull().default(0),
    isSuccessful: integer('is_successful', { mode: 'boolean' }).notNull().default(false),
    isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    uuidUnique: uniqueIndex('server_backups_uuid_unique').on(table.uuid),
    serverIdIndex: uniqueIndex('server_backups_server_id_index').on(table.serverId),
  }),
)

export const serverTransfers = sqliteTable(
  'server_transfers',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    oldNode: text('old_node').notNull(),
    newNode: text('new_node').notNull(),
    oldAllocation: text('old_allocation').notNull(),
    newAllocation: text('new_allocation').notNull(),
    oldAdditionalAllocations: text('old_additional_allocations'),
    newAdditionalAllocations: text('new_additional_allocations'),
    successful: integer('successful', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
)

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    actor: text('actor').notNull(),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: text('metadata'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  table => ({
    occurredIndex: uniqueIndex('audit_events_occurred_id').on(table.occurredAt, table.id),
  }),
)

export const recoveryTokens = sqliteTable('recovery_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const nests = sqliteTable('nests', {
  id: text('id').primaryKey(),
  uuid: text('uuid').notNull().unique(),
  author: text('author').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const eggs = sqliteTable('eggs', {
  id: text('id').primaryKey(),
  uuid: text('uuid').notNull().unique(),
  nestId: text('nest_id').notNull().references(() => nests.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  dockerImage: text('docker_image').notNull(),
  dockerImages: text('docker_images'),
  startup: text('startup').notNull(),
  configFiles: text('config_files'),
  configStartup: text('config_startup'),
  configStop: text('config_stop'),
  configLogs: text('config_logs'),
  scriptContainer: text('script_container'),
  scriptEntry: text('script_entry'),
  scriptInstall: text('script_install'),
  copyScriptFrom: text('copy_script_from'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const eggVariables = sqliteTable('egg_variables', {
  id: text('id').primaryKey(),
  eggId: text('egg_id').notNull().references(() => eggs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  envVariable: text('env_variable').notNull(),
  defaultValue: text('default_value'),
  userViewable: integer('user_viewable', { mode: 'boolean' }).notNull().default(true),
  userEditable: integer('user_editable', { mode: 'boolean' }).notNull().default(true),
  rules: text('rules'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const mounts = sqliteTable('mounts', {
  id: text('id').primaryKey(),
  uuid: text('uuid').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  source: text('source').notNull(),
  target: text('target').notNull(),
  readOnly: integer('read_only', { mode: 'boolean' }).notNull().default(false),
  userMountable: integer('user_mountable', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const mountEgg = sqliteTable('mount_egg', {
  mountId: text('mount_id').notNull().references(() => mounts.id, { onDelete: 'cascade' }),
  eggId: text('egg_id').notNull().references(() => eggs.id, { onDelete: 'cascade' }),
}, table => ({
  pk: primaryKey({ columns: [table.mountId, table.eggId] }),
}))

export const mountNode = sqliteTable('mount_node', {
  mountId: text('mount_id').notNull().references(() => mounts.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull().references(() => wingsNodes.id, { onDelete: 'cascade' }),
}, table => ({
  pk: primaryKey({ columns: [table.mountId, table.nodeId] }),
}))

export const mountServer = sqliteTable('mount_server', {
  mountId: text('mount_id').notNull().references(() => mounts.id, { onDelete: 'cascade' }),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
}, table => ({
  pk: primaryKey({ columns: [table.mountId, table.serverId] }),
}))

export type UserRow = typeof users.$inferSelect
export type AccountRow = typeof accounts.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type VerificationTokenRow = typeof verificationTokens.$inferSelect
export type LocationRow = typeof locations.$inferSelect
export type WingsNodeRow = typeof wingsNodes.$inferSelect
export type ServerRow = typeof servers.$inferSelect
export type ServerLimitRow = typeof serverLimits.$inferSelect
export type ServerAllocationRow = typeof serverAllocations.$inferSelect
export type ServerStartupEnvRow = typeof serverStartupEnv.$inferSelect
export type ServerScheduleRow = typeof serverSchedules.$inferSelect
export type ServerSubuserRow = typeof serverSubusers.$inferSelect
export type ServerBackupRow = typeof serverBackups.$inferSelect
export type ServerTransferRow = typeof serverTransfers.$inferSelect
export type AuditEventRow = typeof auditEvents.$inferSelect
export type RecoveryTokenRow = typeof recoveryTokens.$inferSelect
export type DatabaseHostRow = typeof databaseHosts.$inferSelect
export type NestRow = typeof nests.$inferSelect
export type EggRow = typeof eggs.$inferSelect
export type EggVariableRow = typeof eggVariables.$inferSelect
export type MountRow = typeof mounts.$inferSelect

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type SettingRow = typeof settings.$inferSelect

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyType: integer('key_type').notNull().default(1),
  identifier: text('identifier', { length: 16 }).notNull().unique(),
  token: text('token').notNull(),
  allowedIps: text('allowed_ips'),
  memo: text('memo'),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),

  rServers: integer('r_servers').notNull().default(0),
  rNodes: integer('r_nodes').notNull().default(0),
  rAllocations: integer('r_allocations').notNull().default(0),
  rUsers: integer('r_users').notNull().default(0),
  rLocations: integer('r_locations').notNull().default(0),
  rNests: integer('r_nests').notNull().default(0),
  rEggs: integer('r_eggs').notNull().default(0),
  rDatabaseHosts: integer('r_database_hosts').notNull().default(0),
  rServerDatabases: integer('r_server_databases').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export type ApiKeyRow = typeof apiKeys.$inferSelect

export const sshKeys = sqliteTable('ssh_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fingerprint: text('fingerprint').notNull().unique(),
  publicKey: text('public_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export type SshKeyRow = typeof sshKeys.$inferSelect

export const tables = {
  users,
  accounts,
  sessions,
  verificationTokens,
  locations,
  wingsNodes,
  serverAllocations,
  servers,
  serverLimits,
  serverStartupEnv,
  serverEnvironmentVariables,
  serverSchedules,
  serverScheduleTasks,
  databaseHosts,
  serverDatabases,
  serverSubusers,
  serverBackups,
  serverTransfers,
  auditEvents,
  recoveryTokens,
  nests,
  eggs,
  eggVariables,
  mounts,
  mountEgg,
  mountNode,
  mountServer,
  settings,
  apiKeys,
  sshKeys,
}
