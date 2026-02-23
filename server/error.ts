import type { H3Event, H3Error } from 'h3';
import { recordAuditEventFromRequest } from '#server/utils/audit';

type EventAuthContext = {
  auth?: {
    user?: {
      id?: string | null;
      email?: string | null;
    } | null;
    apiKey?: {
      id?: string | null;
    } | null;
  };
};

function getEventAuthContext(event: H3Event): EventAuthContext | null {
  const ctx = event.context;
  if (!ctx || typeof ctx !== 'object' || !('auth' in ctx)) {
    return null;
  }

  const auth = ctx.auth;
  if (!auth || typeof auth !== 'object') {
    return null;
  }

  const userCandidate = 'user' in auth ? auth.user : null;
  const apiKeyCandidate = 'apiKey' in auth ? auth.apiKey : null;

  const normalized: EventAuthContext = {
    auth: {},
  };

  if (userCandidate && typeof userCandidate === 'object') {
    normalized.auth!.user = {
      id: 'id' in userCandidate && typeof userCandidate.id === 'string' ? userCandidate.id : null,
      email:
        'email' in userCandidate && typeof userCandidate.email === 'string'
          ? userCandidate.email
          : null,
    };
  }

  if (apiKeyCandidate && typeof apiKeyCandidate === 'object') {
    normalized.auth!.apiKey = {
      id:
        'id' in apiKeyCandidate && typeof apiKeyCandidate.id === 'string'
          ? apiKeyCandidate.id
          : null,
    };
  }

  return normalized;
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
  {
    defaultHandler: _defaultHandler,
  }: {
    defaultHandler: (
      error: H3Error | Error,
      event: H3Event,
      opts?: { silent?: boolean; json?: boolean },
    ) => Promise<{
      status: number;
      statusText?: string;
      headers: Record<string, string>;
      body: string | Record<string, unknown>;
    }>;
  },
) {
  const url = event.node.req.url || '';
  const path = event.path || url.split('?')[0] || '';
  const isApiRoute = path.startsWith('/api/') || url.startsWith('/api/');

  const isH3Error = (e: H3Error | Error): e is H3Error => {
    return 'statusCode' in e;
  };

  const h3Error = isH3Error(error) ? error : null;

  const logStatus = h3Error?.statusCode || (error as { status?: number }).status;
  console.error('[Error Handler] Error caught:', {
    path,
    url,
    isApiRoute,
    status: logStatus,
    message: error.message,
    accept: event.node.req.headers.accept,
    errorName: error.name,
    stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    data: h3Error?.data,
  });

  if (!isApiRoute) {
    return;
  }

  const anyError = error as H3Error & { status?: number; statusText?: string };
  const status = h3Error?.statusCode || anyError?.status || 500;
  const statusText = h3Error?.statusMessage || anyError?.statusText || 'Internal Server Error';
  const message = error.message || 'An error occurred';

  if (shouldAuditPrivilegedFailure(path, status)) {
    try {
      const authContext = getEventAuthContext(event);
      const auth = authContext?.auth;
      const userId = auth?.user?.id ?? null;
      const userEmail = auth?.user?.email ?? null;
      const apiKeyId = auth?.apiKey?.id ?? null;

      const actor = userEmail || userId || getRequestIP(event) || 'system';

      await recordAuditEventFromRequest(event, {
        actor,
        actorType: userId ? 'user' : 'system',
        action: 'security.request.denied',
        targetType: 'settings',
        targetId: path,
        metadata: {
          status,
          statusText,
          message,
          method: event.method,
          apiKeyId: apiKeyId ?? undefined,
        },
      });
    } catch (auditError) {
      console.error('[Error Handler] Failed to write failure audit event:', auditError);
    }
  }

  console.log('[Error Handler] Returning JSON for API route:', { path, status, statusText });

  // For API routes ALWAYS return JSON - don't rely on defaultHandler
  const body = JSON.stringify(
    {
      error: true,
      url: url,
      status,
      statusText,
      message,
      ...(h3Error?.data ? { data: h3Error.data } : {}),
      ...(process.env.NODE_ENV === 'development' && error.stack
        ? {
            stack: error.stack.split('\n').map((line: string) => line.trim()),
          }
        : {}),
    },
    null,
    process.env.NODE_ENV === 'development' ? 2 : 0,
  );

  return new Response(body, {
    status,
    statusText,
    headers: {
      'Content-Type': 'application/json',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-cache',
    },
  });
}
