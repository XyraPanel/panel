import { z } from 'zod';

export const serverCommandSchema = z.object({
  command: z.string().trim().min(1, 'Command is required').max(2048, 'Command is too long'),
});

export type ServerCommandInput = z.infer<typeof serverCommandSchema>;

export const createServerDatabaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Database name is required')
    .max(100, 'Database name must be under 100 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Database name can only contain letters, numbers, and underscores'),
  remote: z.string().trim().min(1, 'Remote host is required').max(255, 'Remote value is too long'),
});

export const createDatabaseSchema = createServerDatabaseSchema;
export type CreateServerDatabaseInput = z.infer<typeof createServerDatabaseSchema>;

const scheduleCronValueSchema = z
  .string()
  .trim()
  .min(1, 'Cron segment is required')
  .max(64, 'Cron segment is too long');

const scheduleCronSchema = z.object({
  minute: scheduleCronValueSchema,
  hour: scheduleCronValueSchema,
  day_of_month: scheduleCronValueSchema,
  month: scheduleCronValueSchema,
  day_of_week: scheduleCronValueSchema,
});

export const createScheduleSchema = z.object({
  name: z.string().trim().min(1, 'Schedule name is required').max(255, 'Schedule name is too long'),
  cron: scheduleCronSchema,
  is_active: z.boolean().optional(),
});

export const clientUpdateScheduleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Schedule name is required')
    .max(255, 'Schedule name is too long')
    .optional(),
  cron: scheduleCronSchema.optional(),
  is_active: z.boolean().optional(),
});

export const updateScheduleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Schedule name is required')
    .max(255, 'Schedule name is too long')
    .optional(),
  cron: z
    .string()
    .trim()
    .min(1, 'Cron expression is required')
    .max(255, 'Cron expression is too long')
    .optional(),
  action: z.string().trim().max(255, 'Action is too long').optional(),
  enabled: z.boolean().optional(),
});

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

export const createTaskSchema = z.object({
  action: z.string().trim().min(1, 'Action is required').max(255, 'Action is too long'),
  payload: z.string().trim().min(1, 'Payload is required').max(10000, 'Payload is too long'),
  time_offset: z
    .number()
    .int()
    .min(0, 'Time offset cannot be negative')
    .max(3600, 'Time offset cannot exceed 3600 seconds')
    .optional()
    .default(0),
  continue_on_failure: z.boolean().optional().default(false),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  action: z.string().trim().min(1, 'Action is required').max(255, 'Action is too long').optional(),
  payload: z
    .string()
    .trim()
    .min(1, 'Payload is required')
    .max(10000, 'Payload is too long')
    .optional(),
  time_offset: z
    .number()
    .int()
    .min(0, 'Time offset cannot be negative')
    .max(3600, 'Time offset cannot exceed 3600 seconds')
    .optional(),
  continue_on_failure: z.boolean().optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateDockerImageSchema = z.object({
  dockerImage: z.string().min(1, 'Docker image is required').max(255, 'Docker image is too long'),
});

export const attachMountSchema = z.object({
  mountId: z.uuid('Mount ID must be a valid UUID'),
});

export type UpdateDockerImageInput = z.infer<typeof updateDockerImageSchema>;
export type AttachMountInput = z.infer<typeof attachMountSchema>;

export const serverRenameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Server name is required')
    .max(255, 'Server name must be 255 characters or less'),
  description: z.string().trim().max(2000, 'Description is too long').optional().nullable(),
});

export const serverPowerActionSchema = z.object({
  action: z
    .enum(['start', 'stop', 'restart', 'kill'])
    .describe('Invalid power action. Must be one of: start, stop, restart, kill'),
});

export const serverClientRenameSchema = z.object({
  name: z.string().trim().min(1, 'Server name is required').max(500, 'Server name is too long'),
  description: z.string().trim().max(500, 'Description is too long').optional().nullable(),
});

export const serverScheduleCreateSchema = z.object({
  name: z.string().trim().min(1, 'Schedule name is required').max(255, 'Schedule name is too long'),
  cron: z
    .string()
    .trim()
    .min(1, 'Cron expression is required')
    .max(255, 'Cron expression is too long'),
  action: z.string().trim().min(1, 'Action is required').max(255, 'Action is too long'),
  enabled: z.boolean().optional(),
});

const filePathSchema = z.string().min(1, 'File path is required');

export const writeFileSchema = z.object({
  file: z.string().optional(),
  path: z.string().optional(),
  content: z.string().optional(),
  contents: z.string().optional(),
});

export const renameFileInstructionSchema = z.object({
  from: filePathSchema,
  to: filePathSchema,
});

export const renameFilesSchema = z.object({
  root: z.string().optional(),
  files: z.array(renameFileInstructionSchema).nonempty('Rename instructions are required'),
});

export const serverSubuserPermissionsSchema = z.object({
  permissions: z
    .array(z.string().trim().min(1, 'Permission is required'))
    .min(1, 'At least one permission must be provided'),
});

export const deleteFilesSchema = z.object({
  root: z.string().optional(),
  files: z.array(filePathSchema).nonempty('At least one file path is required'),
});

export const compressFilesSchema = z.object({
  root: z.string().trim().min(1, 'Root path is required'),
  files: z.array(filePathSchema).nonempty('Files array is required'),
});

export const decompressFileSchema = z.object({
  root: z.string().trim().min(1, 'Root path is required'),
  file: filePathSchema,
});

export const pullFileSchema = z.object({
  url: z.string().trim().url('A valid source URL is required'),
  directory: z.string().optional(),
});

export const copyFileSchema = z.object({
  location: z.string().trim().min(1, 'A target location is required to copy the file.'),
});

export const createDirectorySchema = z.object({
  root: z.string().optional(),
  name: z.string().trim().min(1, 'Directory name is required'),
});

export const serverStartupVariableSchema = z.object({
  key: z.string().trim().min(1, 'Variable key is required'),
  value: z.string().optional().nullable(),
});

export const serverDockerImageUpdateSchema = z.object({
  docker_image: z.string().trim().min(1, 'Docker image is required'),
});

const chmodModeSchema = z.union([z.string().trim().min(1, 'Mode is required'), z.number()]);

export const chmodInstructionSchema = z.object({
  file: filePathSchema,
  mode: chmodModeSchema.transform((value) =>
    typeof value === 'number' ? value.toString() : value,
  ),
});

export const chmodBodySchema = z.object({
  root: z.string().optional(),
  files: z.array(chmodInstructionSchema).nonempty('File chmod instructions are required'),
});
