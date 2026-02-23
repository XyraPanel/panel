import { createError, type H3Event, readBody } from 'h3';
import { getServerSession } from '#server/utils/session';
import { requireAdminPermission } from '#server/utils/permission-middleware';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { requireSessionUser } from '#server/utils/auth/sessionUser';
import type { z } from 'zod';

export const BODY_SIZE_LIMITS = {
  SMALL: 64 * 1024,
  MEDIUM: 512 * 1024,
  LARGE: 10 * 1024 * 1024,
  VERY_LARGE: 100 * 1024 * 1024,
} as const;

async function assertBodySize(event: H3Event, limit: number): Promise<void> {
  const req = event.node.req;
  const contentLength = req.headers['content-length'];

  if (contentLength) {
    const headerSize = Number.parseInt(
      Array.isArray(contentLength) ? contentLength[0] : contentLength,
      10,
    );
    if (!Number.isNaN(headerSize) && headerSize > limit) {
      throw createError({
        status: 413,
        statusText: 'Request Entity Too Large',
        message: `Request body size (${headerSize} bytes) exceeds the limit of ${limit} bytes`,
      });
    }
  }
}

export async function requireAuth(event: H3Event) {
  const session = await getServerSession(event);

  if (!session?.user?.id) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  return session;
}

export async function requireAccountUser(event: H3Event) {
  const session = await requireAuth(event);
  const user = requireSessionUser(session);

  return { session, user };
}

export async function requireAdmin(event: H3Event) {
  await requireAdminPermission(event);
  const session = await getServerSession(event);

  if (!session) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  return session;
}

export async function readValidatedBodyWithLimit<T extends z.ZodType>(
  event: H3Event,
  schema: T,
  limit: number = BODY_SIZE_LIMITS.MEDIUM,
): Promise<z.infer<T>> {
  await assertBodySize(event, limit);

  const body = await readBody(event);

  const bodySize = Buffer.isBuffer(body)
    ? body.length
    : typeof body === 'string'
      ? Buffer.byteLength(body, 'utf8')
      : Buffer.byteLength(JSON.stringify(body), 'utf8');

  if (bodySize > limit) {
    throw createError({
      status: 413,
      statusText: 'Request Entity Too Large',
      message: `Request body size (${bodySize} bytes) exceeds the limit of ${limit} bytes`,
    });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    throw createError({
      status: 400,
      statusText: 'Validation failed',
      message: 'Request body validation failed',
      data: { errors },
    });
  }

  return result.data;
}

export async function isApiKeyAuthenticated(event: H3Event): Promise<boolean> {
  const authHeader = event.node.req.headers.authorization;
  const apiKeyHeader = event.node.req.headers['x-api-key'];

  if (apiKeyHeader || (authHeader && authHeader.startsWith('Bearer '))) {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });

    return !!session?.user?.id;
  }

  return false;
}

export async function requireApiKeyAuth(event: H3Event) {
  const isApiKey = await isApiKeyAuthenticated(event);

  if (!isApiKey) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message:
        'API key authentication required. Provide a valid API key via Authorization: Bearer <key> or x-api-key header.',
    });
  }

  return await requireAuth(event);
}
