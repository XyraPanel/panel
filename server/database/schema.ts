import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  uniqueIndex,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayUsername: text('display_username'),
    email: text('email').notNull(),
    password: text('password').notNull(),
    nameFirst: text('name_first'),
    nameLast: text('name_last'),
    language: text('language').notNull().default('en'),
    rootAdmin: boolean('root_admin').notNull().default(false),
    role: text('role').notNull().default('user'),
    emailVerified: timestamp('email_verified', { mode: 'string' }),
    image: text('image'),
    suspended: boolean('suspended').notNull().default(false),
    suspendedAt: timestamp('suspended_at', { mode: 'string' }),
    suspensionReason: text('suspension_reason'),
    passwordResetRequired: boolean('password_reset_required').notNull().default(false),
    banned: boolean('banned'),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { mode: 'string' }),

    useTotp: boolean('use_totp').notNull().default(false),
    totpSecret: text('totp_secret'),
    totpAuthenticatedAt: timestamp('totp_authenticated_at', { mode: 'string' }),
    twoFactorEnabled: boolean('two_factor_enabled'),
    rememberToken: text('remember_token'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
    index('users_role_index').on(table.role),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerId: text('provider_id'),
    providerAccountId: text('provider_account_id').notNull(),
    accountId: text('account_id'),
    password: text('password'),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    refreshTokenExpiresIn: integer('refresh_token_expires_in'),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'string' }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'string' }),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
    oauthTokenSecret: text('oauth_token_secret'),
    oauthToken: text('oauth_token'),
    createdAt: timestamp('created_at', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
  },
  (table) => [
    uniqueIndex('accounts_provider_provider_account_id_index').on(
      table.provider,
      table.providerAccountId,
    ),
    index('accounts_user_id_index').on(table.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    sessionToken: text('session_token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'string' }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
    impersonatedBy: text('impersonated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('sessions_user_id_index').on(table.userId),
    index('sessions_expires_index').on(table.expires),
    index('sessions_token_index').on(table.sessionToken),
  ],
);

export const sessionMetadata = pgTable(
  'session_metadata',
  {
    sessionToken: text('session_token')
      .primaryKey()
      .references(() => sessions.sessionToken, { onDelete: 'cascade' }),
    firstSeenAt: timestamp('first_seen_at', { mode: 'string' }),
    lastSeenAt: timestamp('last_seen_at', { mode: 'string' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    deviceName: text('device_name'),
    browserName: text('browser_name'),
    osName: text('os_name'),
  },
  (table) => [index('session_metadata_last_seen_index').on(table.lastSeenAt)],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    value: text('value'),
    expires: timestamp('expires', { mode: 'string' }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
  },
  (table) => [
    uniqueIndex('verification_token_identifier_token_index').on(table.identifier, table.token),
    index('verification_tokens_identifier_index').on(table.identifier),
  ],
);

export const locations = pgTable(
  'locations',
  {
    id: text('id').primaryKey(),
    short: text('short').notNull(),
    long: text('long'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('locations_short_unique').on(table.short)],
);

export const wingsNodes = pgTable(
  'wings_nodes',
  {
    id: text('id').primaryKey(),
    uuid: text('uuid').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    baseUrl: text('base_url').notNull(),
    fqdn: text('fqdn').notNull(),
    scheme: text('scheme').notNull(),
    public: boolean('public').notNull().default(true),
    maintenanceMode: boolean('maintenance_mode').notNull().default(false),
    allowInsecure: boolean('allow_insecure').notNull().default(false),
    behindProxy: boolean('behind_proxy').notNull().default(false),
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
    lastSeenAt: timestamp('last_seen_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('wings_nodes_base_url_unique').on(table.baseUrl),
    uniqueIndex('wings_nodes_uuid_unique').on(table.uuid),
  ],
);

export const serverAllocations = pgTable(
  'server_allocations',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => wingsNodes.id, { onDelete: 'cascade' }),
    serverId: text('server_id'),
    ip: text('ip').notNull(),
    port: integer('port').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    ipAlias: text('ip_alias'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('server_allocations_unique').on(table.nodeId, table.ip, table.port)],
);

export const servers = pgTable(
  'servers',
  {
    id: text('id').primaryKey(),
    uuid: text('uuid').notNull(),
    identifier: text('identifier').notNull(),
    externalId: text('external_id'),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status'),
    suspended: boolean('suspended').notNull().default(false),
    skipScripts: boolean('skip_scripts').notNull().default(false),
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
    oomDisabled: boolean('oom_disabled').notNull().default(true),
    installedAt: timestamp('installed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('servers_uuid_unique').on(table.uuid),
    uniqueIndex('servers_identifier_unique').on(table.identifier),
    uniqueIndex('servers_external_id_unique').on(table.externalId),
    index('servers_owner_id_index').on(table.ownerId),
    index('servers_node_id_index').on(table.nodeId),
    index('servers_status_index').on(table.status),
  ],
);

export const serverLimits = pgTable('server_limits', {
  serverId: text('server_id')
    .primaryKey()
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  memory: integer('memory'),
  memoryOverallocate: integer('memory_overallocate'),
  disk: integer('disk'),
  diskOverallocate: integer('disk_overallocate'),
  swap: integer('swap'),
  io: integer('io'),
  cpu: integer('cpu'),
  threads: text('threads'),
  oomDisabled: boolean('oom_disabled').notNull().default(true),
  databaseLimit: integer('database_limit'),
  allocationLimit: integer('allocation_limit'),
  backupLimit: integer('backup_limit'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const serverStartupEnv = pgTable(
  'server_startup_env',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    isEditable: boolean('is_editable').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('server_env_key_unique').on(table.serverId, table.key)],
);

export const serverEnvironmentVariables = serverStartupEnv;

export const serverSchedules = pgTable(
  'server_schedules',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cron: text('cron').notNull(),
    action: text('action').notNull(),
    nextRunAt: timestamp('next_run_at', { mode: 'string' }),
    lastRunAt: timestamp('last_run_at', { mode: 'string' }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    index('server_schedules_enabled_next_run_index').on(table.enabled, table.nextRunAt),
    index('server_schedules_server_id_index').on(table.serverId),
  ],
);

export const serverScheduleTasks = pgTable(
  'server_schedule_tasks',
  {
    id: text('id').primaryKey(),
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => serverSchedules.id, { onDelete: 'cascade' }),
    sequenceId: integer('sequence_id').notNull(),
    action: text('action').notNull(),
    payload: text('payload'),
    timeOffset: integer('time_offset').notNull().default(0),
    continueOnFailure: boolean('continue_on_failure').notNull().default(false),
    isQueued: boolean('is_queued').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('server_schedule_tasks_sequence').on(table.scheduleId, table.sequenceId)],
);

export const databaseHosts = pgTable('database_hosts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hostname: text('hostname').notNull(),
  port: integer('port').notNull().default(3306),
  username: text('username'),
  password: text('password'),
  database: text('database'),
  nodeId: text('node_id').references(() => wingsNodes.id),
  maxDatabases: integer('max_databases'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const serverDatabases = pgTable(
  'server_databases',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    databaseHostId: text('database_host_id')
      .notNull()
      .references(() => databaseHosts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    username: text('username').notNull(),
    password: text('password').notNull(),
    remote: text('remote').notNull(),
    maxConnections: integer('max_connections'),
    status: text('status').notNull().default('ready'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('server_databases_unique_name_per_server').on(table.serverId, table.name),
  ],
);

export const serverSubusers = pgTable(
  'server_subusers',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissions: text('permissions').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('server_subusers_unique_user_per_server').on(table.serverId, table.userId),
  ],
);

export const serverBackups = pgTable(
  'server_backups',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    uuid: text('uuid').notNull(),
    name: text('name').notNull(),
    ignoredFiles: text('ignored_files'),
    disk: text('disk').notNull().default('wings'),
    checksum: text('checksum'),
    bytes: integer('bytes').notNull().default(0),
    isSuccessful: boolean('is_successful').notNull().default(false),
    isLocked: boolean('is_locked').notNull().default(false),
    completedAt: timestamp('completed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('server_backups_uuid_unique').on(table.uuid),
    index('server_backups_server_id_index').on(table.serverId),
  ],
);

export const serverTransfers = pgTable('server_transfers', {
  id: text('id').primaryKey(),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  oldNode: text('old_node').notNull(),
  newNode: text('new_node').notNull(),
  oldAllocation: text('old_allocation').notNull(),
  newAllocation: text('new_allocation').notNull(),
  oldAdditionalAllocations: text('old_additional_allocations'),
  newAdditionalAllocations: text('new_additional_allocations'),
  successful: boolean('successful').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    occurredAt: timestamp('occurred_at', { mode: 'string' }).notNull(),
    actor: text('actor').notNull(),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('audit_events_occurred_id').on(table.occurredAt, table.id),
    index('audit_events_actor_index').on(table.actor),
    index('audit_events_action_index').on(table.action),
    index('audit_events_occurred_at_index').on(table.occurredAt),
  ],
);

export const recoveryTokens = pgTable('recovery_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  usedAt: timestamp('used_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
});

export const nests = pgTable('nests', {
  id: text('id').primaryKey(),
  uuid: text('uuid').notNull().unique(),
  author: text('author').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const eggs = pgTable('eggs', {
  id: text('id').primaryKey(),
  uuid: text('uuid').notNull().unique(),
  nestId: text('nest_id')
    .notNull()
    .references(() => nests.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  features: text('features'),
  fileDenylist: text('file_denylist'),
  updateUrl: text('update_url'),
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
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const eggVariables = pgTable('egg_variables', {
  id: text('id').primaryKey(),
  eggId: text('egg_id')
    .notNull()
    .references(() => eggs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  envVariable: text('env_variable').notNull(),
  defaultValue: text('default_value'),
  userViewable: boolean('user_viewable').notNull().default(true),
  userEditable: boolean('user_editable').notNull().default(true),
  rules: text('rules'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const mounts = pgTable('mounts', {
  id: text('id').primaryKey(),
  uuid: text('uuid').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  source: text('source').notNull(),
  target: text('target').notNull(),
  readOnly: boolean('read_only').notNull().default(false),
  userMountable: boolean('user_mountable').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export const mountEgg = pgTable(
  'mount_egg',
  {
    mountId: text('mount_id')
      .notNull()
      .references(() => mounts.id, { onDelete: 'cascade' }),
    eggId: text('egg_id')
      .notNull()
      .references(() => eggs.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.mountId, table.eggId] })],
);

export const mountNode = pgTable(
  'mount_node',
  {
    mountId: text('mount_id')
      .notNull()
      .references(() => mounts.id, { onDelete: 'cascade' }),
    nodeId: text('node_id')
      .notNull()
      .references(() => wingsNodes.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.mountId, table.nodeId] })],
);

export const mountServer = pgTable(
  'mount_server',
  {
    mountId: text('mount_id')
      .notNull()
      .references(() => mounts.id, { onDelete: 'cascade' }),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.mountId, table.serverId] })],
);

export type UserRow = typeof users.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type VerificationTokenRow = typeof verificationTokens.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type WingsNodeRow = typeof wingsNodes.$inferSelect;
export type ServerRow = typeof servers.$inferSelect;
export type ServerLimitRow = typeof serverLimits.$inferSelect;
export type ServerAllocationRow = typeof serverAllocations.$inferSelect;
export type ServerStartupEnvRow = typeof serverStartupEnv.$inferSelect;
export type ServerScheduleRow = typeof serverSchedules.$inferSelect;
export type ServerSubuserRow = typeof serverSubusers.$inferSelect;
export type ServerBackupRow = typeof serverBackups.$inferSelect;
export type ServerTransferRow = typeof serverTransfers.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type RecoveryTokenRow = typeof recoveryTokens.$inferSelect;
export type DatabaseHostRow = typeof databaseHosts.$inferSelect;
export type NestRow = typeof nests.$inferSelect;
export type EggRow = typeof eggs.$inferSelect;
export type EggVariableRow = typeof eggVariables.$inferSelect;
export type MountRow = typeof mounts.$inferSelect;

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type SettingRow = typeof settings.$inferSelect;

export const apiKeys = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier'),
    memo: text('memo'),
    name: text('name'),
    start: text('start'),
    prefix: text('prefix'),
    key: text('key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { mode: 'string' }),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),
    enabled: boolean('enabled').notNull().default(true),
    rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count').notNull().default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request', { mode: 'string' }),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [index('api_key_user_id_index').on(table.userId)],
);

export const apiKeyMetadata = pgTable(
  'api_key_metadata',
  {
    id: text('id').primaryKey(),
    apiKeyId: text('api_key_id')
      .notNull()
      .unique()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    keyType: integer('key_type').notNull().default(1),
    allowedIps: text('allowed_ips'),
    memo: text('memo'),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),

    rServers: integer('r_servers').notNull().default(0),
    rNodes: integer('r_nodes').notNull().default(0),
    rAllocations: integer('r_allocations').notNull().default(0),
    rUsers: integer('r_users').notNull().default(0),
    rLocations: integer('r_locations').notNull().default(0),
    rNests: integer('r_nests').notNull().default(0),
    rEggs: integer('r_eggs').notNull().default(0),
    rDatabaseHosts: integer('r_database_hosts').notNull().default(0),
    rServerDatabases: integer('r_server_databases').notNull().default(0),

    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [index('api_key_metadata_api_key_id_index').on(table.apiKeyId)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type ApiKeyMetadataRow = typeof apiKeyMetadata.$inferSelect;

export const sshKeys = pgTable('ssh_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fingerprint: text('fingerprint').notNull().unique(),
  publicKey: text('public_key').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
});

export type SshKeyRow = typeof sshKeys.$inferSelect;

export const rateLimit = pgTable(
  'rate_limit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    count: integer('count').notNull().default(0),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('rate_limit_key_index').on(table.key),
    index('rate_limit_last_request_index').on(table.lastRequest),
  ],
);

export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret'),
    backupCodes: text('backup_codes'),
  },
  (table) => [
    index('two_factor_secret_idx').on(table.secret),
    index('two_factor_user_id_idx').on(table.userId),
  ],
);

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string' }),
});

export const emailTemplates = pgTable(
  'email_templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    templateId: text('template_id').notNull().unique(),
    subject: text('subject').notNull(),
    htmlContent: text('html_content').notNull(),
    isCustom: boolean('is_custom').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  },
  (table) => [index('email_templates_template_id_index').on(table.templateId)],
);

export const tables = {
  users,
  accounts,
  sessions,
  sessionMetadata,
  verificationTokens,
  rateLimit,
  twoFactor,
  jwks,
  emailTemplates,
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
  apiKeyMetadata,
  sshKeys,
};
