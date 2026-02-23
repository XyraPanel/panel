import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'crypto';
import { decryptToken } from '#server/utils/wings/encryption';
import type { WingsJWTClaims, WingsJWTOptions } from '#shared/types/wings';

export async function generateWingsJWT(
  node: { tokenSecret: string; baseUrl: string },
  options: WingsJWTOptions = {},
): Promise<string> {
  let signingKey: string;
  try {
    signingKey = decryptToken(node.tokenSecret);
  } catch {
    signingKey = node.tokenSecret;
  }

  const secret = new TextEncoder().encode(signingKey);

  const identifier = options.identifiedBy
    ? hashIdentifier(options.identifiedBy)
    : randomIdentifier();

  const jwt = new SignJWT({
    unique_id: randomString(16),
    ...(options.user?.uuid && { user_uuid: options.user.uuid }),
    ...(options.user?.id && { user_id: options.user.id }),
    ...(options.server?.uuid && { server_uuid: options.server.uuid }),
    ...(options.permissions && { permissions: options.permissions }),
  })
    .setProtectedHeader({
      alg: 'HS256',
      jti: identifier,
    })
    .setIssuedAt()
    .setIssuer(getAppUrl())
    .setAudience(getAppUrl())
    .setJti(identifier)
    .setNotBefore(Math.floor(Date.now() / 1000) - 300);

  if (options.expiresIn) {
    if (typeof options.expiresIn === 'number') {
      jwt.setExpirationTime(Math.floor(Date.now() / 1000) + options.expiresIn);
    } else {
      jwt.setExpirationTime(options.expiresIn);
    }
  }

  if (options.subject) {
    jwt.setSubject(options.subject);
  }

  return await jwt.sign(secret);
}

export async function verifyWingsJWT(
  token: string,
  node: { tokenSecret: string; baseUrl: string },
): Promise<WingsJWTClaims> {
  let signingKey: string;
  try {
    signingKey = decryptToken(node.tokenSecret);
  } catch {
    signingKey = node.tokenSecret;
  }

  const secret = new TextEncoder().encode(signingKey);

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: getAppUrl(),
      audience: getAppUrl(),
    });

    return payload as WingsJWTClaims;
  } catch (error) {
    throw new Error(
      `JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export async function generateWebSocketCredentials(
  node: {
    id: string;
    baseUrl: string;
    tokenSecret: string;
    scheme: string;
    fqdn: string;
    daemonListen: number;
  },
  server: { uuid: string; id: string },
  user: { id: string; uuid?: string },
) {
  const token = await generateWingsJWT(node, {
    user: {
      id: user.id,
      uuid: user.uuid,
    },
    server: {
      uuid: server.uuid,
    },
    permissions: ['*'],
    expiresIn: '2h',
    identifiedBy: `${user.id}${server.uuid}`,
  });

  const wsScheme = node.scheme === 'https' ? 'wss' : 'ws';
  const socket = `${wsScheme}://${node.fqdn}:${node.daemonListen}/api/servers/${server.uuid}/ws`;

  return {
    token,
    socket,
  };
}

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomIdentifier(): string {
  return randomBytes(16).toString('hex');
}

function randomString(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

function getAppUrl(): string {
  const appUrl = process.env.NUXT_PUBLIC_APP_URL || process.env.APP_URL;

  if (appUrl) {
    return appUrl;
  }

  if (process.env.NODE_ENV === 'production' && !appUrl) {
    console.warn(
      '[Wings JWT] APP_URL not set in production! Using localhost. Set NUXT_PUBLIC_APP_URL or APP_URL environment variable.',
    );
  }

  return 'http://localhost:3000';
}
