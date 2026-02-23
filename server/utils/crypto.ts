import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { CookieSerializeOptions } from 'cookie-es';
import { useRuntimeConfig } from '#imports';
import type { AuthCookieOptions, CookieSameSite, ExtendedRuntimeConfig } from '#shared/types/auth';

const HASHED_TOKEN_REGEX = /^[a-f0-9]{64}$/i;
let cachedKey: Buffer | null = null;
let cachedSecret: string | null = null;

function resolveEncryptionKey(): Buffer {
  const runtimeConfig = useRuntimeConfig() as ExtendedRuntimeConfig;

  const secret = runtimeConfig.auth?.tokenSecret || '';

  const material = secret.length > 0 ? secret : 'XyraPanel-development-secret';

  if (cachedKey && cachedSecret === material) {
    return cachedKey;
  }

  const derived = createHash('sha256').update(material, 'utf8').digest();
  cachedKey = derived;
  cachedSecret = material;
  return derived;
}

export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

function _encryptTokenLegacy(token: string): string {
  const key = resolveEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function _decryptTokenLegacy(value: string): string | null {
  try {
    const [ivBase64, dataBase64] = value.split('.');
    if (!ivBase64 || !dataBase64) {
      return null;
    }

    const key = resolveEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64url');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataBase64, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn('[auth] Failed to decrypt token value', error);
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isHashedToken(token: string): boolean {
  return HASHED_TOKEN_REGEX.test(token);
}

export function toStoredToken(token: string): string {
  return isHashedToken(token) ? token.toLowerCase() : hashToken(token);
}

export function resolveAuthCookieOptions(): AuthCookieOptions {
  const runtimeConfig = useRuntimeConfig() as ExtendedRuntimeConfig;

  const cookieConfig = runtimeConfig.auth?.cookie;

  const secureDefault = process.env.NODE_ENV === 'production';
  const secure = typeof cookieConfig?.secure === 'boolean' ? cookieConfig.secure : secureDefault;
  const sameSite = (cookieConfig?.sameSite ?? 'lax') as CookieSameSite;
  const domain = cookieConfig?.domain || undefined;

  return { secure, sameSite, domain };
}

export function buildCookieSerializeOptions(
  overrides: Partial<CookieSerializeOptions> = {},
): CookieSerializeOptions {
  const base = resolveAuthCookieOptions();
  return {
    httpOnly: true,
    sameSite: base.sameSite,
    secure: base.secure,
    path: '/',
    ...('domain' in base && base.domain ? { domain: base.domain } : {}),
    ...overrides,
  };
}
