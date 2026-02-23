import { z } from 'zod';

const ipRegex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
const ipValidator = z.string().regex(ipRegex, 'Invalid IP address format');

export const adminApiKeyPermissionActionSchema = z.enum(['read', 'write', 'delete']);
export type AdminApiKeyPermissionAction = z.infer<typeof adminApiKeyPermissionActionSchema>;

export const createAdminApiKeySchema = z.object({
  memo: z.string().trim().max(500, 'Description too long').optional(),
  allowedIps: z.array(ipValidator).max(128).optional(),
  expiresAt: z.string().optional(),
  permissions: z.record(z.string(), adminApiKeyPermissionActionSchema.array()).optional(),
});

export type CreateAdminApiKeyInput = z.infer<typeof createAdminApiKeySchema>;
