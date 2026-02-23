import { createError, sendRedirect, type H3Event } from 'h3';
import type { AuthContext, ResolvedSessionUser } from '#shared/types/auth';
import type { ApiKeyPermissions, PermissionAction } from '#shared/types/admin';
import { getServerSession } from '#server/utils/session';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { requireSessionUser } from '#server/utils/auth/sessionUser';

type EventContextWithAuth = H3Event['context'] & { auth?: AuthContext };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isPermissionAction(value: unknown): value is PermissionAction {
  return value === 'read' || value === 'write' || value === 'delete';
}

function parseApiKeyPermissions(value: unknown): ApiKeyPermissions {
  let candidate: unknown = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }

  if (!isRecord(candidate)) {
    return {};
  }

  const parsed: Record<string, PermissionAction[]> = {};
  for (const [key, rawActions] of Object.entries(candidate)) {
    if (!Array.isArray(rawActions)) {
      continue;
    }
    const actions = rawActions.filter(isPermissionAction);
    if (actions.length > 0) {
      parsed[key] = actions;
    }
  }

  return parsed as ApiKeyPermissions;
}

function parseApiKeyVerification(value: unknown): {
  valid: boolean;
  key: { id: string; userId: string; permissions: ApiKeyPermissions } | null;
} {
  if (!isRecord(value)) {
    return { valid: false, key: null };
  }

  const valid = value.valid === true;
  const keyValue = isRecord(value.key) ? value.key : null;
  const key =
    keyValue && typeof keyValue.id === 'string' && typeof keyValue.userId === 'string'
      ? {
          id: keyValue.id,
          userId: keyValue.userId,
          permissions: parseApiKeyPermissions(keyValue.permissions ?? keyValue.metadata ?? null),
        }
      : null;

  return { valid, key };
}

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
  /^\/api\/application(?:\/|$)/,
  /^\/api\/_nuxt_icon(?:\/|$)/,
  /^\/api\/_nuxt(?:\/|$)/,
  /^\/api\/maintenance-status(?:\/|$)/,
  // Remote daemon/SFTP endpoints: keep explicit allowlist to avoid exposing future routes by default.
  /^\/api\/remote\/activity(?:\/|$)/,
  /^\/api\/remote\/sftp\/auth(?:\/|$)/,
  /^\/api\/remote\/servers(?:\/|$)/,
  /^\/api\/remote\/servers\/reset(?:\/|$)/,
  /^\/api\/remote\/servers\/[^/]+(?:\/|$)/,
  /^\/api\/remote\/servers\/[^/]+\/archive(?:\/|$)/,
  /^\/api\/remote\/servers\/[^/]+\/install(?:\/|$)/,
  /^\/api\/remote\/servers\/[^/]+\/transfer\/[^/]+(?:\/|$)/,
  /^\/api\/remote\/backups\/[^/]+(?:\/|$)/,
  /^\/api\/remote\/backups\/[^/]+\/restore(?:\/|$)/,
  /^\/api\/system(?:\/|$)/,
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
  const rawPath = event.path ?? requestUrl;
  const path = rawPath.split('?')[0] ?? '/';

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

      try {
        const verification = parseApiKeyVerification(
          await auth.api.verifyApiKey({
            body: { key: apiKeyValue },
            headers,
          }),
        );

        if (!verification.valid || !verification.key) {
          throw createError({
            status: 401,
            statusText: 'Unauthorized',
            message: 'Invalid API key',
          });
        }

        const resolvedUser: ResolvedSessionUser = {
          id: verification.key.userId,
          username: verification.key.userId,
          email: null,
          role: 'user',
          name: null,
          image: null,
          permissions: [],
          remember: null,
          passwordResetRequired: false,
        };

        ctx.auth = {
          session: null,
          user: resolvedUser,
          apiKey: {
            id: verification.key.id,
            userId: verification.key.userId,
            permissions: verification.key.permissions,
          },
        };

        return;
      } catch (error) {
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
