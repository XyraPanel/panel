import { z } from 'zod';

export const suspensionActionSchema = z.object({
  action: z.enum(['suspend', 'unsuspend'], 'Action must be one of: suspend, unsuspend'),
  reason: z.string().trim().max(500, 'Reason must be under 500 characters').optional().nullable(),
  banExpiresIn: z
    .number()
    .int()
    .positive('Ban expiration must be a positive number of seconds')
    .optional()
    .nullable(),
});

export type SuspensionActionInput = z.infer<typeof suspensionActionSchema>;

export const resetPasswordActionSchema = z.object({
  mode: z.enum(['link', 'temporary']).default('link'),
  password: z
    .string()
    .trim()
    .min(12, 'Password must be at least 12 characters long')
    .max(255, 'Password is too long')
    .optional(),
  notify: z.boolean().default(true),
});

export type ResetPasswordActionInput = z.infer<typeof resetPasswordActionSchema>;

export const serverActionSchema = z.object({
  action: z.enum([
    'suspend',
    'unsuspend',
    'reinstall',
    'delete',
    'start',
    'stop',
    'restart',
    'kill',
  ]),
});

export type ServerActionInput = z.infer<typeof serverActionSchema>;

export const disableTwoFactorActionSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .default({});

export type DisableTwoFactorActionInput = z.infer<typeof disableTwoFactorActionSchema>;
