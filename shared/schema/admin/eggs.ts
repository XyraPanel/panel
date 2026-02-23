import { z } from 'zod';
import type { EggImportData } from '#shared/types/admin';

const jsonRecordSchema = z.record(z.string(), z.any()).optional();

export const eggImportSchema = z.object({
  nestId: z.string().min(1),
  eggData: z.custom<EggImportData>(),
});

export type EggImportInput = z.infer<typeof eggImportSchema>;

export const createEggSchema = z.object({
  nestId: z.string().uuid(),
  author: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().max(1000).optional(),
  features: z.array(z.string()).optional(),
  fileDenylist: z.array(z.string()).optional(),
  updateUrl: z.string().trim().max(2048).optional(),
  dockerImage: z.string().trim().min(1),
  dockerImages: z.array(z.string().trim().min(1)).optional(),
  startup: z.string().trim().min(1),
  configFiles: jsonRecordSchema,
  configStartup: jsonRecordSchema,
  configStop: z.string().optional(),
  configLogs: jsonRecordSchema,
  scriptContainer: z.string().optional(),
  scriptEntry: z.string().optional(),
  scriptInstall: z.string().optional(),
  copyScriptFrom: z.string().optional(),
});

export type CreateEggInput = z.infer<typeof createEggSchema>;
