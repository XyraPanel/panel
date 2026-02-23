import { z } from 'zod';

export const createSubuserSchema = z.object({
  email: z
    .string()
    .trim()
    .max(191, 'Email must be under 191 characters')
    .refine((val) => z.email().safeParse(val).success, 'Enter a valid email address'),
  permissions: z
    .array(z.string().trim().min(1, 'Permission cannot be empty'))
    .min(1, 'At least one permission is required')
    .max(100, 'Too many permissions'),
});

export type CreateSubuserInput = z.infer<typeof createSubuserSchema>;

export const updateSubuserSchema = z.object({
  permissions: z
    .array(z.string().trim().min(1, 'Permission cannot be empty'))
    .min(1, 'At least one permission is required')
    .max(100, 'Too many permissions'),
});

export type UpdateSubuserInput = z.infer<typeof updateSubuserSchema>;

export const updateAllocationSchema = z.object({
  notes: z.string().trim().max(500, 'Notes must be under 500 characters').optional().nullable(),
});

export type UpdateAllocationInput = z.infer<typeof updateAllocationSchema>;
