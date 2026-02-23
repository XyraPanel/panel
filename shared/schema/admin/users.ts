import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(1).max(255).optional(),
  email: z
    .string()
    .min(1)
    .max(255)
    .refine((val) => z.email().safeParse(val).success, 'Invalid email format'),
  password: z.string().min(8).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  nameFirst: z.string().max(255).optional(),
  nameLast: z.string().max(255).optional(),
  language: z.string().max(10).optional(),
  rootAdmin: z.union([z.boolean(), z.string()]).optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

export const updateUserSchema = z.object({
  email: z.email().optional(),
  username: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export const adminCreateUserSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(255),
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  nameFirst: z.string().trim().optional(),
  nameLast: z.string().trim().optional(),
  language: z.string().trim().optional(),
  role: z.enum(['user', 'admin']),
});

export const adminUpdateUserSchema = z.object({
  username: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
  nameFirst: z.string().max(255).nullable().optional(),
  nameLast: z.string().max(255).nullable().optional(),
  language: z.string().max(10).optional(),
  rootAdmin: z.union([z.boolean(), z.string()]).optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export const emailVerificationActionSchema = z.object({
  action: z.enum(['mark-verified', 'mark-unverified', 'resend-link']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type EmailVerificationActionInput = z.infer<typeof emailVerificationActionSchema>;
