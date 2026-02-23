import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

interface BackupDownloadTokenPayload {
  serverUuid: string;
  backupUuid: string;
}

/**
 * Generate a signed JWT token for Wings backup download
 * Wings expects a JWT with server_uuid, backup_uuid, and unique_id
 */
export async function generateBackupDownloadToken(
  payload: BackupDownloadTokenPayload,
  tokenSecret: string,
): Promise<string> {
  const uniqueId = randomUUID();

  const jwtPayload = {
    server_uuid: payload.serverUuid,
    backup_uuid: payload.backupUuid,
    unique_id: uniqueId,
    exp: Math.floor(Date.now() / 1000) + 60 * 5,
  };

  const secret = new TextEncoder().encode(tokenSecret);

  return await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime('5m')
    .sign(secret);
}
