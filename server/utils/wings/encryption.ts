import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key =
    process.env.WINGS_ENCRYPTION_KEY ||
    process.env.NUXT_SESSION_PASSWORD ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET;

  if (!key) {
    throw new Error(
      'Wings token encryption requires one of the following environment variables:\n' +
        '  - WINGS_ENCRYPTION_KEY (preferred for Wings-specific encryption)\n' +
        '  - NUXT_SESSION_PASSWORD (Nuxt session encryption key)\n' +
        '  - BETTER_AUTH_SECRET (Better Auth secret - can be reused)\n' +
        '  - AUTH_SECRET (Alternative auth secret)\n' +
        '\n' +
        'Note: You can use the same BETTER_AUTH_SECRET for both Better Auth and Wings token encryption.',
    );
  }

  const keyBuffer = Buffer.from(key, 'utf-8');
  if (keyBuffer.length < KEY_LENGTH) {
    return Buffer.concat([keyBuffer, Buffer.alloc(KEY_LENGTH - keyBuffer.length)]);
  }

  return keyBuffer.slice(0, KEY_LENGTH);
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const ivBase64 = iv.toString('base64');
  const payload = JSON.stringify({
    iv: ivBase64,
    value: encrypted,
    mac: '',
  });

  return Buffer.from(payload).toString('base64');
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();

  try {
    const payloadJson = Buffer.from(encrypted, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);

    const iv = Buffer.from(payload.iv, 'base64');
    const encryptedData = payload.value;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(
      `Failed to decrypt token: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export function generateToken(length: number = 64): string {
  return randomBytes(length).toString('hex');
}

export function generateTokenId(length: number = 16): string {
  return randomBytes(length).toString('hex');
}

export function formatAuthToken(tokenId: string, encryptedToken: string): string {
  const decryptedToken = decryptToken(encryptedToken);
  return `${tokenId}.${decryptedToken}`;
}

export function parseAuthToken(authHeader: string): { tokenId: string; token: string } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const [tokenId, rawToken, ...rest] = token.split('.');

  if (!tokenId || !rawToken || rest.length > 0) {
    return null;
  }

  return {
    tokenId,
    token: rawToken,
  };
}
