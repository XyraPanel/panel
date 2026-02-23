import { z } from 'zod';

const optionalBoolean = z.boolean().optional();
const optionalPositiveInt = z.number().int().positive().optional();
const optionalNonNegativeInt = z.number().int().nonnegative().optional();

export const createWingsNodeSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Node identifier cannot be empty')
    .max(255, 'Node identifier is too long')
    .optional(),
  name: z.string().trim().min(1, 'Node name is required').max(255, 'Node name is too long'),
  description: z.string().trim().max(1024, 'Description is too long').optional(),
  baseURL: z.string().trim().url('baseURL must be a valid URL'),
  apiToken: z.string().trim().min(16, 'API token must be at least 16 characters long').optional(),
  allowInsecure: optionalBoolean,
  public: optionalBoolean,
  maintenanceMode: optionalBoolean,
  behindProxy: optionalBoolean,
  memory: optionalPositiveInt,
  memoryOverallocate: optionalNonNegativeInt,
  disk: optionalPositiveInt,
  diskOverallocate: optionalNonNegativeInt,
  uploadSize: optionalPositiveInt,
  daemonBase: z
    .string()
    .trim()
    .min(1, 'Daemon base path is required')
    .max(255, 'Daemon base path is too long')
    .optional(),
  daemonListen: optionalPositiveInt,
  daemonSftp: optionalPositiveInt,
});

export const updateWingsNodeSchema = createWingsNodeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one property to update',
  });

export type CreateWingsNodeSchema = z.infer<typeof createWingsNodeSchema>;
export type UpdateWingsNodeSchema = z.infer<typeof updateWingsNodeSchema>;

const trimmedString = z.string().trim().min(1);

export const remoteActivitySchema = z.object({
  event: trimmedString,
  timestamp: z.union([trimmedString, z.number()]),
  server: trimmedString.optional(),
  user: trimmedString.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ip: trimmedString.optional(),
});

export const remoteActivityBatchSchema = z.object({
  data: z.array(remoteActivitySchema),
});

export const remoteSftpAuthSchema = z.object({
  type: z.enum(['password', 'public_key']),
  username: trimmedString,
  password: trimmedString,
  ip: z.string().trim().optional(),
});

export const remoteServersPaginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  per_page: z.coerce.number().int().min(1).max(500).default(50),
});

export const remoteServerArchiveStatusSchema = z.object({
  successful: z.boolean(),
});

export const remoteServerInstallStatusSchema = z.object({
  successful: z.boolean(),
  reinstall: z.boolean().optional().default(false),
});

const remoteBackupPartSchema = z.object({
  etag: trimmedString,
  part_number: z.coerce.number().int().min(1),
});

export const remoteBackupStatusSchema = z.object({
  checksum: z.string().trim(),
  checksum_type: z.string().trim(),
  size: z.coerce.number().int().nonnegative(),
  successful: z.boolean(),
  parts: z.array(remoteBackupPartSchema).nullish(),
});

export const remoteBackupRestoreStatusSchema = z.object({
  successful: z.boolean(),
});
