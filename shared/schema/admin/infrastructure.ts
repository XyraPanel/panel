import { z } from 'zod';

export const createLocationSchema = z.object({
  short: z.string().trim().min(1).max(60),
  long: z.string().trim().max(191).optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

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
});

export const updateNodeSchema = createNodeSchema.partial();

export const nodeSettingsFormSchema = createNodeSchema
  .pick({
    name: true,
    fqdn: true,
    scheme: true,
    public: true,
    maintenanceMode: true,
    behindProxy: true,
    memory: true,
    memoryOverallocate: true,
    disk: true,
    diskOverallocate: true,
    uploadSize: true,
    daemonListen: true,
    daemonSftp: true,
    daemonBase: true,
  })
  .extend({
    description: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (typeof data.daemonBase === 'string' && !data.daemonBase.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['daemonBase'],
        message: 'Daemon base directory must be an absolute path',
      });
    }

    if (typeof data.uploadSize === 'number' && (data.uploadSize < 1 || data.uploadSize > 1024)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uploadSize'],
        message: 'Upload size must be between 1 and 1024 MB',
      });
    }
  });

const ipRegex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

const ipValidator = z.string().regex(ipRegex, 'Invalid IP address format');

const ipOrCidrValidator = z.string().min(1);

export const createAllocationSchema = z.object({
  ip: ipOrCidrValidator,
  ports: z.union([
    z.array(z.number().int().min(1).max(65535)).min(1),
    z.number().int().min(1).max(65535),
  ]),
  alias: z.string().max(255).optional(),
  ipAlias: z.string().max(255).optional(),
});

export const nodeAllocationsCreateSchema = z.object({
  ip: z.union([
    z.string().trim().min(1, 'IP or CIDR is required'),
    z
      .array(z.string().trim().min(1, 'IP address is required'))
      .min(1, 'At least one IP address is required'),
  ]),
  ports: z.string().trim().min(1, 'Ports are required'),
  ipAlias: z.string().trim().optional(),
});

export const updateAllocationSchema = z.object({
  ip: ipValidator.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  alias: z.string().max(255).optional(),
  notes: z.string().optional(),
});

export const createDatabaseHostSchema = z.object({
  name: z.string().trim().min(1).max(255),
  hostname: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional().default(3306),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1),
  database: z.string().trim().min(1).max(255).optional(),
  nodeId: z.string().trim().uuid().optional(),
  maxDatabases: z.number().int().min(0).optional(),
});

export const updateDatabaseHostSchema = createDatabaseHostSchema.partial();

export const createMountSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(500).optional(),
  source: z.string().trim().min(1),
  target: z.string().trim().min(1),
  readOnly: z.boolean().optional().default(false),
  userMountable: z.boolean().optional().default(false),
  nodeIds: z.array(z.string().uuid()).optional(),
  eggIds: z.array(z.string().uuid()).optional(),
});

export const updateMountSchema = createMountSchema.partial();

export const createNestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(500).optional(),
  author: z.string().trim().min(1),
});

export const updateNestSchema = createNestSchema.partial();

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
});

export const updateEggSchema = createEggSchema.partial();

export const createEggVariableSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  envVariable: z.string().min(1).max(255),
  defaultValue: z.string(),
  userViewable: z.boolean().default(true),
  userEditable: z.boolean().default(true),
  rules: z.string().optional(),
});

export const updateEggVariableSchema = createEggVariableSchema.partial();

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type NodeSettingsFormInput = z.infer<typeof nodeSettingsFormSchema>;
export type CreateAllocationInput = z.infer<typeof createAllocationSchema>;
export type UpdateAllocationInput = z.infer<typeof updateAllocationSchema>;
export type NodeAllocationsCreateInput = z.infer<typeof nodeAllocationsCreateSchema>;
export type CreateDatabaseHostInput = z.infer<typeof createDatabaseHostSchema>;
export type UpdateDatabaseHostInput = z.infer<typeof updateDatabaseHostSchema>;
export type CreateMountInput = z.infer<typeof createMountSchema>;
export type UpdateMountInput = z.infer<typeof updateMountSchema>;
export type CreateNestInput = z.infer<typeof createNestSchema>;
export type UpdateNestInput = z.infer<typeof updateNestSchema>;
export type CreateEggInput = z.infer<typeof createEggSchema>;
export type UpdateEggInput = z.infer<typeof updateEggSchema>;
export type CreateEggVariableInput = z.infer<typeof createEggVariableSchema>;
export type UpdateEggVariableInput = z.infer<typeof updateEggVariableSchema>;
