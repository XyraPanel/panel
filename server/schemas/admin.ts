import { z } from 'zod'

export const createLocationSchema = z.object({
  short: z.string().min(1).max(60),
  long: z.string().min(1).max(191).optional(),
})

export const updateLocationSchema = createLocationSchema.partial()

export const createNodeSchema = z.object({
  name: z.string().min(1).max(255),
  locationId: z.string().uuid(),
  fqdn: z.string().min(1).max(255),
  scheme: z.enum(['http', 'https']).default('https'),
  behindProxy: z.boolean().default(false),
  public: z.boolean().default(true),
  maintenanceMode: z.boolean().default(false),
  memory: z.number().int().positive(),
  memoryOverallocate: z.number().int().min(-1).default(0),
  disk: z.number().int().positive(),
  diskOverallocate: z.number().int().min(-1).default(0),
  daemonBase: z.string().default('/var/lib/pterodactyl/volumes'),
  daemonSftp: z.number().int().min(1).max(65535).default(2022),
  daemonListen: z.number().int().min(1).max(65535).default(8080),
  uploadSize: z.number().int().positive().default(100),
})

export const updateNodeSchema = createNodeSchema.partial()

export const createAllocationSchema = z.object({
  ip: z.string().ip(),
  ports: z.array(z.number().int().min(1).max(65535)).min(1),
  alias: z.string().max(255).optional(),
})

export const updateAllocationSchema = z.object({
  ip: z.string().ip().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  alias: z.string().max(255).optional(),
  notes: z.string().optional(),
})

export const createDatabaseHostSchema = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(3306),
  username: z.string().min(1).max(255),
  password: z.string().min(1),
  maxDatabases: z.number().int().min(0).default(0),
})

export const updateDatabaseHostSchema = createDatabaseHostSchema.partial()

export const createMountSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  source: z.string().min(1),
  target: z.string().min(1),
  readOnly: z.boolean().default(false),
  userMountable: z.boolean().default(false),
  nodeIds: z.array(z.string().uuid()).optional(),
  eggIds: z.array(z.string().uuid()).optional(),
})

export const updateMountSchema = createMountSchema.partial()

export const createNestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
})

export const updateNestSchema = createNestSchema.partial()

export const createEggSchema = z.object({
  nestId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  dockerImage: z.string().min(1),
  startup: z.string().min(1),
  configFiles: z.string().optional(),
  configStartup: z.string().optional(),
  configStop: z.string().optional(),
  configLogs: z.string().optional(),
})

export const updateEggSchema = createEggSchema.partial()

export const createEggVariableSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  envVariable: z.string().min(1).max(255),
  defaultValue: z.string(),
  userViewable: z.boolean().default(true),
  userEditable: z.boolean().default(true),
  rules: z.string().optional(),
})

export const updateEggVariableSchema = createEggVariableSchema.partial()

export const createServerSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  userId: z.string().uuid(),
  eggId: z.string().uuid(),
  nodeId: z.string().uuid(),
  allocationId: z.string().uuid(),
  memory: z.number().int().positive(),
  swap: z.number().int().min(0).default(0),
  disk: z.number().int().positive(),
  io: z.number().int().min(10).max(1000).default(500),
  cpu: z.number().int().min(0).default(0),
  threads: z.string().optional(),
  databases: z.number().int().min(0).default(0),
  allocations: z.number().int().min(0).default(0),
  backups: z.number().int().min(0).default(0),
  startup: z.string().optional(),
  environment: z.record(z.string()).optional(),
  skipScripts: z.boolean().default(false),
  startOnCompletion: z.boolean().default(true),
})

export const updateServerBuildSchema = z.object({
  memory: z.number().int().positive().optional(),
  swap: z.number().int().min(0).optional(),
  disk: z.number().int().positive().optional(),
  io: z.number().int().min(10).max(1000).optional(),
  cpu: z.number().int().min(0).optional(),
  threads: z.string().optional(),
  allocationId: z.string().uuid().optional(),
  addAllocations: z.array(z.string().uuid()).optional(),
  removeAllocations: z.array(z.string().uuid()).optional(),
})

export const updateServerStartupSchema = z.object({
  startup: z.string().optional(),
  environment: z.record(z.string()).optional(),
  eggId: z.string().uuid().optional(),
  dockerImage: z.string().optional(),
  skipScripts: z.boolean().optional(),
})

export const updateServerDetailsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  userId: z.string().uuid().optional(),
})

export const createServerDatabaseSchema = z.object({
  database: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
  remote: z.string().default('%'),
})

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(['user', 'admin']).default('user'),
})

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['user', 'admin']).optional(),
})

export const updateGeneralSettingsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  brandText: z.string().optional(),
  showBrandText: z.boolean().optional(),
  showBrandLogo: z.boolean().optional(),
  brandLogoUrl: z.string().url().optional().nullable(),
})

export const updateSecuritySettingsSchema = z.object({
  enforceTwoFactor: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().optional(),
  announcementEnabled: z.boolean().optional(),
  announcementMessage: z.string().optional(),
})

export const updateMailSettingsSchema = z.object({
  driver: z.enum(['smtp', 'sendmail', 'mailgun']).optional(),
  host: z.string().optional(),
  port: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  encryption: z.enum(['tls', 'ssl', 'none']).optional(),
  fromAddress: z.string().email().optional(),
  fromName: z.string().optional(),
})

export const updateAdvancedSettingsSchema = z.object({
  telemetryEnabled: z.boolean().optional(),
  debugMode: z.boolean().optional(),
  recaptchaEnabled: z.boolean().optional(),
  recaptchaSiteKey: z.string().optional(),
  recaptchaSecretKey: z.string().optional(),
  sessionTimeoutMinutes: z.number().int().positive().optional(),
  queueConcurrency: z.number().int().positive().optional(),
  queueRetryLimit: z.number().int().min(0).optional(),
})

export const createAdminApiKeySchema = z.object({
  memo: z.string().min(1).max(500),
  allowedIps: z.array(z.string().ip()).optional(),
  expiresAt: z.string().datetime().optional(),
})

export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type CreateNodeInput = z.infer<typeof createNodeSchema>
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>
export type CreateAllocationInput = z.infer<typeof createAllocationSchema>
export type UpdateAllocationInput = z.infer<typeof updateAllocationSchema>
export type CreateDatabaseHostInput = z.infer<typeof createDatabaseHostSchema>
export type UpdateDatabaseHostInput = z.infer<typeof updateDatabaseHostSchema>
export type CreateMountInput = z.infer<typeof createMountSchema>
export type UpdateMountInput = z.infer<typeof updateMountSchema>
export type CreateNestInput = z.infer<typeof createNestSchema>
export type UpdateNestInput = z.infer<typeof updateNestSchema>
export type CreateEggInput = z.infer<typeof createEggSchema>
export type UpdateEggInput = z.infer<typeof updateEggSchema>
export type CreateEggVariableInput = z.infer<typeof createEggVariableSchema>
export type UpdateEggVariableInput = z.infer<typeof updateEggVariableSchema>
export type CreateServerInput = z.infer<typeof createServerSchema>
export type UpdateServerBuildInput = z.infer<typeof updateServerBuildSchema>
export type UpdateServerStartupInput = z.infer<typeof updateServerStartupSchema>
export type UpdateServerDetailsInput = z.infer<typeof updateServerDetailsSchema>
export type CreateServerDatabaseInput = z.infer<typeof createServerDatabaseSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UpdateGeneralSettingsInput = z.infer<typeof updateGeneralSettingsSchema>
export type UpdateSecuritySettingsInput = z.infer<typeof updateSecuritySettingsSchema>
export type UpdateMailSettingsInput = z.infer<typeof updateMailSettingsSchema>
export type UpdateAdvancedSettingsInput = z.infer<typeof updateAdvancedSettingsSchema>
export type CreateAdminApiKeyInput = z.infer<typeof createAdminApiKeySchema>
