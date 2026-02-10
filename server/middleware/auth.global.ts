import { createError, sendRedirect, type H3Event } from 'h3';
import type { AuthContext, ResolvedSessionUser } from '#shared/types/auth';
import { getServerSession } from '#server/utils/session';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { requireSessionUser } from '#server/utils/auth/sessionUser';

type EventContextWithAuth = H3Event['context'] & { auth?: AuthContext };

const PUBLIC_ASSET_PREFIXES = ['/_nuxt/', '/__nuxt_devtools__/', '/_ipx/', '/public/'];

const PUBLIC_ASSET_PATHS = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
  '/site.webmanifest',
  '/sw.js',
  '/service-worker.js',
]);

const PUBLIC_PAGE_PATTERNS = [/^\/auth(?:\/|$)/];

const PROTECTED_PAGE_PATTERNS = [
  /^\/$/,
  /^\/account(?:\/|$)/,
  /^\/admin(?:\/|$)/,
  /^\/server(?:\/|$)/,
];

const PUBLIC_API_PATTERNS = [
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/account\/register(?:\/|$)/,
  /^\/api\/branding(?:\/|$)/,
  /^\/api\/remote(?:\/|$)/,
  /^\/api\/application(?:\/|$)/,
  /^\/api\/_nuxt_icon(?:\/|$)/,
  /^\/api\/_nuxt(?:\/|$)/,
  /^\/api\/maintenance-status(?:\/|$)/,
];

function isAssetPath(path: string): boolean {
  return (
    PUBLIC_ASSET_PATHS.has(path) ||
    PUBLIC_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    (path.includes('.') && !path.startsWith('/api/'))
  );
}

function matchesPattern(patterns: RegExp[], path: string): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

function isProtectedPagePath(path: string): boolean {
  return matchesPattern(PROTECTED_PAGE_PATTERNS, path);
}

function isPublicPagePath(path: string): boolean {
  return matchesPattern(PUBLIC_PAGE_PATTERNS, path);
}

function isPublicApiPath(path: string): boolean {
  return matchesPattern(PUBLIC_API_PATTERNS, path);
}

function redirectToLogin(event: H3Event, requestUrl: string) {
  const path = event.path ?? requestUrl.split('?')[0] ?? '/';
  const searchParams = new URLSearchParams();
  if (path !== '/auth/login' && !path.startsWith('/auth/')) {
    searchParams.set('redirect', requestUrl);
  }

  const redirectTarget =
    searchParams.size > 0 ? `/auth/login?${searchParams.toString()}` : '/auth/login';

  return sendRedirect(event, redirectTarget, 302);
}

export default defineEventHandler(async (event) => {
  const requestUrl = event.node.req.url ?? '/';
  const path = event.path ?? requestUrl.split('?')[0] ?? '/';

  if (!path || isAssetPath(path)) {
    return;
  }

  const isApiRequest = path.startsWith('/api/');

  if (isApiRequest && isPublicApiPath(path)) {
    return;
  }

  if (!isApiRequest && isPublicPagePath(path)) {
    return;
  }

  if (!isApiRequest && !isProtectedPagePath(path)) {
    return;
  }

  const ctx = event.context as EventContextWithAuth;
  const existingAuth = ctx.auth;
  if (existingAuth?.session && existingAuth.user) {
    return;
  }

  if (isApiRequest) {
    const hasAuthHeader = Boolean(event.node.req.headers.authorization);
    const hasApiKeyHeader = Boolean(event.node.req.headers['x-api-key']);

    if (
      hasApiKeyHeader ||
      (hasAuthHeader && event.node.req.headers.authorization?.startsWith('Bearer '))
    ) {
      const rawKeyHeader = event.node.req.headers['x-api-key'];
      const apiKeyValue =
        typeof rawKeyHeader === 'string'
          ? rawKeyHeader
          : Array.isArray(rawKeyHeader)
            ? rawKeyHeader[0]
            : event.node.req.headers.authorization?.startsWith('Bearer ')
              ? event.node.req.headers.authorization.slice(7)
              : null;

      if (!apiKeyValue || typeof apiKeyValue !== 'string') {
        return;
      }

      const auth = getAuth();
      const headers = normalizeHeadersForAuth(event.node.req.headers);
      const authApi = auth.api as typeof auth.api & {
        verifyApiKey?: (options: {
          body: { key: string };
          headers?: Record<string, string>;
        }) => Promise<{
          valid: boolean;
          key: { userId?: string; id?: string } | null;
        }>;
      };

      try {
        if (typeof authApi.verifyApiKey !== 'function') {
          throw createError({
            status: 500,
            statusText: 'API key verification unavailable',
          });
        }

        const verification = await authApi.verifyApiKey({
          body: { key: apiKeyValue },
          headers,
        });

        if (!verification.valid || !verification.key?.userId) {
          throw createError({
            status: 401,
            statusText: 'Unauthorized',
            message: 'Invalid API key',
          });
        }

        const { useDrizzle, tables, eq } = await import('#server/utils/drizzle');
        const db = useDrizzle();

        const dbUser = db
          .select({
            id: tables.users.id,
            username: tables.users.username,
            email: tables.users.email,
            role: tables.users.role,
            rootAdmin: tables.users.rootAdmin,
            passwordResetRequired: tables.users.passwordResetRequired,
          })
          .from(tables.users)
          .where(eq(tables.users.id, verification.key.userId))
          .get();

        if (!dbUser) {
          throw createError({
            status: 401,
            statusText: 'Unauthorized',
            message: 'User not found',
          });
        }

        const resolvedUser: ResolvedSessionUser = {
          id: dbUser.id,
          username: dbUser.username || '',
          email: dbUser.email || null,
          role: dbUser.rootAdmin || dbUser.role === 'admin' ? 'admin' : 'user',
          name: null,
          image: null,
          permissions: [],
          remember: null,
          passwordResetRequired: dbUser.passwordResetRequired || false,
        };

        ctx.auth = {
          session: null,
          user: resolvedUser,
        };

        try {
          const { recordAuditEventFromRequest } = await import('#server/utils/audit');
          recordAuditEventFromRequest(event, {
            actor: verification.key.userId,
            actorType: 'user',
            action: 'account.api_key.used',
            targetType: 'api_key',
            targetId: verification.key.id,
            metadata: {
              endpoint: event.node.req.url,
              method: event.method,
            },
          }).catch((err) => console.error('Failed to log API key usage:', err));
        } catch (logError) {
          console.error('Failed to import audit logging:', logError);
        }

        return;
      } catch (error) {
        try {
          const { recordAuditEventFromRequest } = await import('#server/utils/audit');
          recordAuditEventFromRequest(event, {
            actor: 'unknown',
            actorType: 'system',
            action: 'account.api_key.invalid',
            targetType: 'api_key',
            metadata: {
              endpoint: event.node.req.url,
              method: event.method,
              reason: error instanceof Error ? error.message : 'unknown_error',
            },
          }).catch((err) => console.error('Failed to log failed API key attempt:', err));
        } catch (logError) {
          console.error('Failed to import audit logging:', logError);
        }

        if (error && typeof error === 'object' && 'status' in error) {
          throw error;
        }

        console.error('API key verification failed:', error);
      }
    }
  }

  const session = await getServerSession(event);

  if (!session?.user?.id) {
    if (isApiRequest) {
      throw createError({
        status: 401,
        statusText: 'Unauthorized',
        message: 'Authentication required.',
      });
    }

    return redirectToLogin(event, requestUrl);
  }

  let user;
  try {
    user = requireSessionUser(session);
  } catch (error) {
    if (isApiRequest) {
      throw error;
    }
    return redirectToLogin(event, requestUrl);
  }

  if (path.startsWith('/admin') && user.role !== 'admin') {
    if (isApiRequest) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
        message: 'Administrator privileges required.',
      });
    }

    return sendRedirect(event, '/', 302);
  }

  const isForcedResetPage = path.startsWith('/auth/password/force');
  const isForcedResetApi = path.startsWith('/api/account/password/force');

  if (user.passwordResetRequired && !isForcedResetPage && !isForcedResetApi) {
    if (isApiRequest) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
        message: 'Password reset required.',
      });
    }

    const searchParams = new URLSearchParams();
    if (!path.startsWith('/auth/')) {
      searchParams.set('redirect', requestUrl);
    }

    const redirectTarget =
      searchParams.size > 0
        ? `/auth/password/force?${searchParams.toString()}`
        : '/auth/password/force';

    return sendRedirect(event, redirectTarget, 302);
  }

  ctx.auth = {
    session,
    user,
  };
});
