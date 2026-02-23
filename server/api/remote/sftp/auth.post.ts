import { type H3Event } from 'h3';
import { eq } from 'drizzle-orm';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { listServerSubusers } from '#server/utils/subusers';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { recordAuditEvent } from '#server/utils/audit';
import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { remoteSftpAuthSchema } from '#shared/schema/wings';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 60000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle();
  const body = await readValidatedBodyWithLimit(
    event,
    remoteSftpAuthSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const clientIp = getRequestIP(event) || body.ip || 'unknown';

  if (!checkRateLimit(clientIp)) {
    throw createError({
      status: 429,
      statusText: 'Too Many Requests',
      message: 'Too many SFTP authentication attempts. Please try again later.',
    });
  }

  const { type, username, password: credential } = body;

  const parts = username.split('.');
  if (parts.length < 2) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Invalid SFTP credentials format',
    });
  }

  const serverIdentifier = parts[parts.length - 1]!;
  const userIdentifier = parts.slice(0, -1).join('.');

  const serverResult = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverIdentifier))
    .limit(1);

  const server = serverResult[0];

  if (!server) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Invalid SFTP credentials',
    });
  }

  const userResult = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.username, userIdentifier))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Invalid SFTP credentials',
    });
  }

  if (type === 'password') {
    const auth = getAuth();
    try {
      const signInResult = await auth.api.signInUsername({
        body: {
          username: userIdentifier,
          password: credential,
          rememberMe: false,
        },
        headers: normalizeHeadersForAuth(event.node.req.headers),
      });

      if (
        !isRecord(signInResult) ||
        typeof signInResult.token !== 'string' ||
        signInResult.token.length === 0
      ) {
        throw createError({
          status: 401,
          statusText: 'Unauthorized',
          message: 'Invalid SFTP credentials',
        });
      }

      await db.delete(tables.sessions).where(eq(tables.sessions.sessionToken, signInResult.token));
    } catch (error) {
      if (error instanceof APIError) {
        throw createError({
          status: 401,
          statusText: 'Unauthorized',
          message: 'Invalid SFTP credentials',
        });
      }
      throw error;
    }
  } else if (type === 'public_key') {
    try {
      const cleanKey = credential.trim().split(/\s+/);
      if (cleanKey.length < 2) {
        throw new Error('Invalid key format');
      }

      const keyData = cleanKey[1];
      if (!keyData) {
        throw new Error('Invalid key data');
      }

      const validKeyData = keyData;
      const keyType = cleanKey[0];

      const sshKeys = await db
        .select({ fingerprint: tables.sshKeys.fingerprint, publicKey: tables.sshKeys.publicKey })
        .from(tables.sshKeys)
        .where(eq(tables.sshKeys.userId, user.id));

      const sshKey = sshKeys.find((key) => {
        const storedParts = key.publicKey.trim().split(/\s+/);
        if (storedParts.length < 2) return false;

        const storedType = storedParts[0];
        const storedData = storedParts[1];

        return storedType === keyType && storedData === validKeyData;
      });

      if (!sshKey) {
        throw createError({
          status: 401,
          statusText: 'Unauthorized',
          message: 'Invalid SSH key',
        });
      }
    } catch {
      throw createError({
        status: 401,
        statusText: 'Unauthorized',
        message: 'Invalid SSH key',
      });
    }
  }

  const isAdmin = user.role === 'admin';
  const isOwner = server.ownerId === user.id;

  let permissions: string[] = [];

  if (isAdmin || isOwner) {
    permissions = ['*'];
  } else {
    const subusers = await listServerSubusers(server.id);
    const subuser = subusers.find((entry) => entry.userId === user.id);

    if (!subuser) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
        message: 'You do not have access to this server',
      });
    }

    permissions = subuser.permissions;
  }

  await recordAuditEvent({
    actor: user.email,
    actorType: 'user',
    action: 'sftp.auth',
    targetType: 'server',
    targetId: server.uuid,
    metadata: {
      ip: clientIp,
      username,
      successful: true,
    },
  });

  return {
    server: server.uuid,
    user: user.username,
    permissions,
  };
});
