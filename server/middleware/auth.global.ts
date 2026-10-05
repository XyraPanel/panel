import type { H3Event } from 'h3';
import type { AuthContext, ResolvedSessionUser } from '#shared/types/auth';
import type { ApiKeyPermissions, PermissionAction } from '#shared/types/admin';
import { getServerSession } from '#server/utils/session';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { requireSessionUser } from '#server/utils/auth/sessionUser';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';

// Deliberately narrow: only the exact surface needed to view/complete 2FA setup.
// Do NOT widen this to a blanket `/account` or `/api/account` prefix — that would
// re-exempt sensitive mutating endpoints (minting API keys, adding SSH keys, changing
// email) from the enforcement policy below, letting an under-enrolled account issue
// durable credentials that then never have to satisfy the 2FA gate at all.
const TWO_FACTOR_EXEMPT_PATTERNS = [
  /^\/account\/security(?:\/|$)/,
  /^\/api\/account\/password(?:\/|$)/,
  /^\/api\/user\/2fa(?:\/|$)/,
  /^\/api\/me(?:\/|$)/,
  /^\/api\/branding(?:\/|$)/,
];

async function enforceTwoFactorIfRequired(
  event: H3Event,
  path: string,
  requestUrl: string,
  userId: string,
  isApiRequest: boolean,
) {
  const isTwoFactorExempt = TWO_FACTOR_EXEMPT_PATTERNS.some((pattern) => pattern.test(path));
  if (isTwoFactorExempt) {
    return;
  }

  const settings = await getSettings([SETTINGS_KEYS.ENFORCE_TWO_FACTOR]);
  if (settings[SETTINGS_KEYS.ENFORCE_TWO_FACTOR] !== 'true') {
    return;
  }

  const [dbUser] = await useDrizzle()
    .select({ twoFactorEnabled: tables.users.twoFactorEnabled })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  if (dbUser?.twoFactorEnabled) {
    return;
  }

  if (isApiRequest) {
    throw createError({
      status: 403,
      message: 'Two-factor authentication is required by your administrator.',
    });
  }

  const searchParams = new URLSearchParams();
  if (!path.startsWith('/account/')) {
    searchParams.set('redirect', requestUrl);
  }

  const redirectTarget =
    searchParams.size > 0 ? `/account/security?${searchParams.toString()}` : '/account/security';

  return sendRedirect(event, redirectTarget, 302);
}

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
  // Wings bootstraps its own config before it has a node token in the usual sense, so
  // this one route authenticates itself (timing-safe node-token check, see the route).
  // Deliberately NOT a blanket /api/application prefix: any future Application API
  // route (WHMCS-style external integrations) added under this namespace must be
  // explicitly allowlisted here too, so it doesn't silently inherit public access.
  /^\/api\/application\/nodes\/[^/]+\/configuration(?:\/|$)/,
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
  const requestUrl = event.path || '/';
  const path = getRequestURL(event).pathname;

  if (!path || isAssetPath(path)) {
    return;
  }

  const isApiRequest = path.startsWith('/api/');

  if (isApiRequest && isPublicApiPath(path)) {
    // /api/auth/** must stay reachable while unauthenticated (login, register, forgot
    // password). But if the caller already HAS a session flagged for a forced password
    // reset, better-auth's own endpoints (mint an API key, disable 2FA, change email,
    // delete account, ...) would otherwise be a clean way to route around the panel's
    // force-reset gate below, which only runs for non-public paths. Block that case
    // specifically, while still letting a flagged session sign out or check itself.
    if (path.startsWith('/api/auth/')) {
      const SAFE_WHILE_RESET_REQUIRED = new Set(['/api/auth/sign-out', '/api/auth/get-session']);

      if (!SAFE_WHILE_RESET_REQUIRED.has(path) && !path.startsWith('/api/auth/password/')) {
        const existingSession = await getServerSession(event);
        if (existingSession?.user?.id) {
          try {
            const sessionUser = requireSessionUser(existingSession);
            if (sessionUser.passwordResetRequired) {
              throw createError({ status: 403, message: 'Password reset required.' });
            }
          } catch (error) {
            if (
              error &&
              typeof error === 'object' &&
              ('statusCode' in error || 'status' in error)
            ) {
              throw error;
            }
            // Malformed/incomplete session data — let the route itself handle it.
          }
        }
      }
    }

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
    const authorization = getHeader(event, 'authorization');
    const apiKey = getHeader(event, 'x-api-key');

    const hasAuthHeader = Boolean(authorization);
    const hasApiKeyHeader = Boolean(apiKey);

    if (
      hasApiKeyHeader ||
      (hasAuthHeader && authorization?.startsWith('Bearer '))
    ) {
      const apiKeyValue = apiKey
        ? apiKey
        : authorization?.startsWith('Bearer ')
          ? authorization.slice(7)
          : null;

      if (!apiKeyValue || typeof apiKeyValue !== 'string') {
        return;
      }

      const headers = getAuthHeaders(event);

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
            message: 'Invalid API key',
          });
        }

        const [keyMetadata] = await useDrizzle()
          .select({ allowedIps: tables.apiKeyMetadata.allowedIps })
          .from(tables.apiKeyMetadata)
          .where(eq(tables.apiKeyMetadata.apiKeyId, verification.key.id))
          .limit(1);

        if (keyMetadata?.allowedIps) {
          let allowedIps: string[] = [];
          try {
            const parsed = JSON.parse(keyMetadata.allowedIps);
            allowedIps = Array.isArray(parsed) ? parsed.filter((ip) => typeof ip === 'string') : [];
          } catch {
            allowedIps = [];
          }

          if (allowedIps.length > 0) {
            const requestIp = getRequestIP(event, { xForwardedFor: true });
            if (!requestIp || !allowedIps.includes(requestIp)) {
              throw createError({
                status: 403,
                message: 'API key is not authorized from this IP address.',
              });
            }
          }
        }

        const isForcedResetApiKeyPath = path.startsWith('/api/account/password/force');
        if (!isForcedResetApiKeyPath) {
          const db = useDrizzle();
          const [dbUser] = await db
            .select({ passwordResetRequired: tables.users.passwordResetRequired })
            .from(tables.users)
            .where(eq(tables.users.id, verification.key.userId))
            .limit(1);

          if (dbUser?.passwordResetRequired) {
            throw createError({
              status: 403,
              message: 'Password reset required.',
            });
          }
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

        const twoFactorResult = await enforceTwoFactorIfRequired(
          event,
          path,
          requestUrl,
          verification.key.userId,
          isApiRequest,
        );
        if (twoFactorResult !== undefined) {
          return twoFactorResult;
        }

        return;
      } catch (error) {
        // h3's createError({ status }) normalizes onto `.statusCode`, not `.status` —
        // checking only 'status' let every createError thrown above (invalid key,
        // IP not allowed, password reset required) get silently swallowed here and
        // fall through to getServerSession()'s own independent API-key auth path
        // below, bypassing all of these checks entirely.
        if (
          error &&
          typeof error === 'object' &&
          ('statusCode' in error || 'status' in error)
        ) {
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

  const twoFactorResult = await enforceTwoFactorIfRequired(
    event,
    path,
    requestUrl,
    user.id,
    isApiRequest,
  );
  if (twoFactorResult !== undefined) {
    return twoFactorResult;
  }

  ctx.auth = {
    session: {
      ...session,
      user,
    },
    user,
  };
});
