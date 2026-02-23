import { z } from 'zod';

export const emailTemplatePreviewValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
]);

export const emailTemplatePreviewSchema = z.object({
  data: z.record(z.string(), emailTemplatePreviewValueSchema),
});

export const emailTemplateUpdateSchema = z.object({
  content: z.string().min(1, 'Template content is required'),
});

export const generalSettingsSchema = z.object({
  locale: z.string().optional(),
  timezone: z.string().optional(),
  showBrandLogo: z.boolean().optional(),
  brandLogoUrl: z.string().nullable().optional(),
  paginationLimit: z.number().int().min(10).max(100).optional(),
  telemetryEnabled: z.boolean().optional(),
});

export const generalSettingsFormSchema = generalSettingsSchema.extend({
  locale: z.string().min(1, 'Locale is required'),
  timezone: z.string().min(1, 'Timezone is required'),
  showBrandLogo: z.boolean().default(false),
  brandLogoUrl: z.string().trim().max(2048).nullable().optional(),
  paginationLimit: z.number().int().min(10).max(100).default(25),
  telemetryEnabled: z.boolean().default(true),
});

export const adminSettingsPayloadSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const mailSettingsSchema = z.object({
  driver: z.string().max(255).optional(),
  service: z.string().max(255).optional(),
  host: z.string().max(255).optional(),
  port: z.union([z.string(), z.number()]).optional(),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  encryption: z.string().max(50).optional(),
  fromAddress: z.string().max(255).optional(),
  fromName: z.string().max(255).optional(),
});

export const mailSettingsFormSchema = z.object({
  driver: z.enum(['smtp', 'sendmail', 'mailgun']).default('smtp'),
  service: z
    .enum([
      'custom',
      'gmail',
      'outlook365',
      'yahoo',
      'zoho',
      'ses',
      'sendgrid',
      'mailgun',
      'postmark',
      'sendinblue',
      'mailjet',
      'mailtrap',
      'proton',
    ])
    .default('custom'),
  host: z.string().trim().max(255).optional().default(''),
  port: z.string().trim().max(5).optional().default('587'),
  username: z.string().trim().max(255).optional().default(''),
  password: z.string().max(255).optional().default(''),
  encryption: z.enum(['tls', 'ssl', 'none']).default('tls'),
  fromAddress: z.string().trim().email('Invalid email address'),
  fromName: z.string().trim().min(1, 'From name is required').max(120, 'From name is too long'),
});

export const securitySettingsSchema = z.object({
  enforceTwoFactor: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(1024).nullable().optional(),
  announcementEnabled: z.boolean().optional(),
  announcementMessage: z.string().max(1024).nullable().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  queueConcurrency: z.number().int().min(1).max(100).optional(),
  queueRetryLimit: z.number().int().min(0).max(50).optional(),
});

export const securitySettingsFormSchema = securitySettingsSchema.extend({
  enforceTwoFactor: z.boolean().default(false),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().trim().max(500).default(''),
  announcementEnabled: z.boolean().default(false),
  announcementMessage: z.string().trim().max(500).default(''),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).default(60),
  queueConcurrency: z.number().int().min(1).max(32).default(4),
  queueRetryLimit: z.number().int().min(1).max(50).default(5),
});

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
export type GeneralSettingsFormInput = z.infer<typeof generalSettingsFormSchema>;
export type MailSettingsInput = z.infer<typeof mailSettingsSchema>;
export type MailSettingsFormInput = z.infer<typeof mailSettingsFormSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
export type SecuritySettingsFormInput = z.infer<typeof securitySettingsFormSchema>;
