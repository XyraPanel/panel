import { z } from 'zod'

export const createLocationSchema = z.object({
  short: z.string().min(1).max(60),
  long: z.string().min(1).max(191).optional(),
})

export const updateLocationSchema = createLocationSchema.partial()

export const createNodeSchema = z.object({
  name: z.string().min(1).max(255),
  locationId: z.uuid(),
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

const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/

const ipValidator = z.string().regex(ipRegex, 'Invalid IP address format')

export const createAllocationSchema = z.object({
  ip: ipValidator,
  ports: z.array(z.number().int().min(1).max(65535)).min(1),
  alias: z.string().max(255).optional(),
})

export const updateAllocationSchema = z.object({
  ip: ipValidator.optional(),
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
  nodeIds: z.array(z.uuid()).optional(),
  eggIds: z.array(z.uuid()).optional(),
})

export const updateMountSchema = createMountSchema.partial()

export const createNestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
})

export const updateNestSchema = createNestSchema.partial()

export const createEggSchema = z.object({
  nestId: z.uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
  fileDenylist: z.array(z.string()).optional(),
  updateUrl: z.string().optional(),
  dockerImage: z.string().min(1),
  dockerImages: z.array(z.string()).optional(),
  startup: z.string().min(1),
  configFiles: z.string().optional(),
  configStartup: z.string().optional(),
  configStop: z.string().optional(),
  configLogs: z.string().optional(),
  scriptContainer: z.string().optional(),
  scriptEntry: z.string().optional(),
  scriptInstall: z.string().optional(),
  copyScriptFrom: z.string().optional(),
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

