import { APIError } from 'better-auth/api';
import { logger } from '#server/utils/logger';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { resolvePanelBaseUrl } from '#server/utils/email';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { passwordRequestSchema } from '#shared/schema/account';
import { buildCacheKey, getCacheItem, setCacheItem } from '#server/utils/cache';

const MAX_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_SECONDS = 300;

async function checkRateLimit(identity: string, ip: string): Promise<boolean> {
  const key = buildCacheKey('password-reset-rl', identity, ip);
  const record = await getCacheItem<{ count: number }>(key);

  if (!record) {
    await setCacheItem(key, { count: 1 }, { ttl: RATE_LIMIT_WINDOW_SECONDS });
    return true;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return false;
  }

  await setCacheItem(key, { count: record.count + 1 }, { ttl: RATE_LIMIT_WINDOW_SECONDS });
  return true;
}

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Request a password reset email',
    description:
      'Public endpoint. Sends a password reset email if the given username/email matches an account. Always returns success to avoid account enumeration; rate-limited to 3 requests per 5 minutes per identity+IP.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['identity'],
            properties: { identity: { type: 'string', description: 'Username or email address' } },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Request accepted (does not indicate whether an account matched)',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
              },
            },
          },
        },
      },
      '429': { description: 'Too many password reset requests' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { identity: rawIdentity } = await readValidatedBodyWithLimit(
    event,
    passwordRequestSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const identity = rawIdentity.toLowerCase();

  const clientIp = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
  if (!(await checkRateLimit(identity, clientIp))) {
    throw createError({
      status: 429,
      message: 'Too many password reset requests. Please try again later.',
    });
  }

  const db = useDrizzle();
  const [user] = await db
    .select({ id: tables.users.id, email: tables.users.email })
    .from(tables.users)
    .where(or(eq(tables.users.email, identity), eq(tables.users.username, identity)))
    .limit(1);

  if (!user?.email) {
    return {
      data: {
        success: true,
        message: 'If an account matches, a password reset email has been sent.',
      },
    };
  }

  const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`;

  const captchaToken = getHeader(event, 'x-captcha-response');
  const authHeaders = getAuthHeaders(event);
  if (captchaToken) {
    authHeaders['x-captcha-response'] = captchaToken;
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: resetBaseUrl,
      },
      headers: authHeaders,
    });

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'auth.password.reset.requested',
      targetType: 'user',
      targetId: user.id,
      metadata: { identity },
    });
  } catch (error) {
    if (error instanceof APIError) {
      logger.error('Failed to send password reset email', {
        status: error.status,
        message: error.message,
      });
    } else {
      logger.error('Failed to send password reset email', error);
    }
  }

  return {
    data: {
      success: true,
      message: 'If an account matches, a password reset email has been sent.',
    },
  };
});
