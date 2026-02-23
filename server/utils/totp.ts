import { randomBytes } from 'node:crypto';

export function generateRecoveryTokens(count: number = 8): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < count; i++) {
    const token = randomBytes(4).toString('hex').toUpperCase();
    tokens.push(token);
  }
  return tokens;
}

export async function hashRecoveryToken(token: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.hash(token, 12);
}

export async function verifyRecoveryToken(token: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.compare(token, hash);
}
