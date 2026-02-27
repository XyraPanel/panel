import type { H3Event, H3Error } from 'h3';
import { recordAuditEventFromRequest } from '#server/utils/audit';

function isH3Error(error: unknown): error is H3Error {
  return !!error && typeof error === 'object' && 'statusCode' in error;
}

const PRIVILEGED_FAILURE_PATTERNS = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/user\/2fa(?:\/|$)/,
  /^\/api\/account\/(?:password|email|sessions|api-keys|ssh-keys)(?:\/|$)/,
];

function shouldAuditPrivilegedFailure(path: string, status: number): boolean {
  if (status < 400) {
    return false;
  }
  return PRIVILEGED_FAILURE_PATTERNS.some((pattern) => pattern.test(path));
}

export default async function errorHandler(
  error: H3Error | Error,
  event: H3Event,
) {
  const path = event.path || '';
  const isApiRoute = path.startsWith('/api/');

  // Extract error details safely
  const statusCode = isH3Error(error) ? error.statusCode : 500;
  const message = error.message || 'An unexpected error occurred';
  const data = isH3Error(error) ? error.data : undefined;

  // Always log errors to server console
  console.error(`[Error Handler] ${event.method} ${path} (${statusCode}):`, {
    message,
    errorName: error.name,
    data,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });

  // Handle auditing for privileged failures
  if (isApiRoute && shouldAuditPrivilegedFailure(path, statusCode)) {
    try {
      const auth = event.context.auth;
      const user = auth?.user;
      const actor = user?.email || user?.id || getRequestIP(event, { xForwardedFor: true }) || 'system';

      await recordAuditEventFromRequest(event, {
        actor,
        actorType: user?.id ? 'user' : 'system',
        action: 'security.request.denied',
        targetType: 'settings',
        targetId: path,
        metadata: {
          statusCode,
          message,
          method: event.method,
          apiKeyId: auth?.apiKey?.id ?? undefined,
        },
      });
    } catch (auditError) {
      console.error('[Error Handler] Failed to write failure audit event:', auditError);
    }
  }

  // Non-API routes are handled by Nuxt's default error page (error.vue)
  if (!isApiRoute) {
    return;
  }

  // API routes: return standardized JSON response
  const isDev = process.env.NODE_ENV === 'development';
  const body = {
    error: true,
    path,
    status: statusCode,
    message,
    data,
    ...(isDev && error.stack ? { stack: error.stack.split('\n').map((s) => s.trim()) } : {}),
  };

  return new Response(JSON.stringify(body, null, isDev ? 2 : 0), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    },
  });
}
