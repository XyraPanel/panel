import { z } from 'zod';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters long')
  .max(191, 'Username must be under 191 characters');

const emailSchema = z
  .string()
  .trim()
  .max(191, 'Email must be under 191 characters')
  .refine((val) => z.email().safeParse(val).success, 'Enter a valid email address');

const currentPasswordSchema = z
  .string()
  .trim()
  .min(8, 'Current password must be at least 8 characters long');

const newPasswordSchema = z
  .string()
  .trim()
  .min(12, 'New password must be at least 12 characters long');

const accountProfileBaseSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
});

export const accountProfileFormSchema = accountProfileBaseSchema.required({
  username: true,
  email: true,
});

export type AccountProfileFormInput = z.infer<typeof accountProfileFormSchema>;

export const accountProfileUpdateSchema = accountProfileBaseSchema.superRefine((data, ctx) => {
  if (data.username === undefined && data.email === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide username or email to update',
      path: ['username'],
    });
  }
});

export type AccountProfileUpdateInput = z.infer<typeof accountProfileUpdateSchema>;

const accountPasswordBaseSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newPasswordSchema,
  confirmPassword: newPasswordSchema.optional(),
});

type PasswordValidationInput = z.infer<typeof accountPasswordBaseSchema>;

function validateAccountPassword(data: PasswordValidationInput, ctx: z.RefinementCtx) {
  if (data.newPassword === data.currentPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['newPassword'],
      message: 'New password must be different from current password',
    });
  }

  if (data.confirmPassword !== undefined && data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    });
  }
}

export const accountPasswordFormSchema = accountPasswordBaseSchema
  .extend({
    confirmPassword: newPasswordSchema,
  })
  .superRefine(validateAccountPassword);

export type AccountPasswordFormInput = z.infer<typeof accountPasswordFormSchema>;

export const accountPasswordUpdateSchema =
  accountPasswordBaseSchema.superRefine(validateAccountPassword);

export type AccountPasswordUpdateInput = z.infer<typeof accountPasswordUpdateSchema>;

const forcedPasswordSchema = z.object({
  newPassword: newPasswordSchema,
  confirmPassword: newPasswordSchema.optional(),
});

type ForcedPasswordInput = z.infer<typeof forcedPasswordSchema>;

function validateForcedPassword(data: ForcedPasswordInput, ctx: z.RefinementCtx) {
  if (data.confirmPassword !== undefined && data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    });
  }
}

export const accountForcedPasswordSchema = forcedPasswordSchema.superRefine(validateForcedPassword);

export type AccountForcedPasswordInput = z.infer<typeof accountForcedPasswordSchema>;

const ipRegex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
const ipValidator = z.string().regex(ipRegex, 'Invalid IP address format');

export const createApiKeySchema = z.object({
  memo: z.string().max(500, 'Description too long').nullable().optional(),
  allowedIps: z.array(ipValidator).nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const createApiKeyFormSchema = z.object({
  memo: z.string().trim().max(255, 'Description too long').optional().default(''),
  allowedIps: z.string().trim().optional().default(''),
});

export const updateEmailSchema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const createSshKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  publicKey: z.string().min(1, 'Public key is required'),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type CreateSshKeyInput = z.infer<typeof createSshKeySchema>;

export const passwordRequestSchema = z.object({
  identity: z
    .string()
    .trim()
    .min(1, 'Enter your username or email address')
    .max(255, 'Identity is too long'),
});

export type PasswordRequestInput = z.output<typeof passwordRequestSchema>;

const passwordResetBaseSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: newPasswordSchema,
  confirmPassword: newPasswordSchema,
});

type PasswordResetValidationInput = z.infer<typeof passwordResetBaseSchema>;

function validatePasswordReset(data: PasswordResetValidationInput, ctx: z.RefinementCtx) {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    });
  }
}

export const passwordResetSchema = passwordResetBaseSchema.superRefine(validatePasswordReset);

export type PasswordResetInput = z.output<typeof passwordResetSchema>;

export const passwordResetPerformSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: newPasswordSchema,
});

export const twoFactorVerifySchema = z.object({
  code: z.string().trim().min(1, 'TOTP code is required'),
  trustDevice: z.boolean().optional(),
});

export const twoFactorRecoverySchema = z.object({
  token: z.string().trim().min(1, 'Recovery token is required'),
});

export const twoFactorEnableSchema = z.object({
  password: z.string().min(1, 'Password is required to enable 2FA'),
  issuer: z.string().trim().min(1).max(191).optional(),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'Password is required to disable 2FA'),
});

export const accountLoginFormSchema = z.object({
  identity: z.string().trim().min(1, 'Enter your username or email address'),
  password: z.string().trim().min(1, 'Enter your password'),
  token: z
    .string()
    .trim()
    .max(64, 'Authenticator code is too long')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type CreateApiKeyFormInput = z.infer<typeof createApiKeyFormSchema>;
export type AccountLoginFormInput = z.infer<typeof accountLoginFormSchema>;
