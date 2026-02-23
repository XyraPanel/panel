import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function generateIdentifier(): string {
  return randomBytes(8).toString('hex');
}

export function generateApiToken(): string {
  return randomBytes(16).toString('hex');
}

export async function hashApiToken(token: string): Promise<string> {
  return bcrypt.hash(token, 12);
}

export async function verifyToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

export function formatApiKey(identifier: string, token: string): string {
  return `${identifier}.${token}`;
}

export function parseApiKey(apiKey: string): { identifier: string; token: string } | null {
  const parts = apiKey.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid API key format');
  }

  return {
    identifier: parts[0],
    token: parts[1],
  };
}
