import { z } from 'zod';

export const consoleBaseMessageSchema = z.object({
  type: z.enum(['auth', 'command', 'status']),
  serverId: z.string().min(1),
  token: z.string().optional(),
  payload: z.unknown().optional(),
});

export type ConsoleBaseMessage = z.infer<typeof consoleBaseMessageSchema>;

export const consoleCommandPayloadSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
});

export type ConsoleCommandPayload = z.infer<typeof consoleCommandPayloadSchema>;
