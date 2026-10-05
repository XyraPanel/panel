import { getSessionCookie } from 'better-auth/cookies';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAuth } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Revoke a session',
    description: 'Revokes a specific session belonging to the authenticated account by its token.',
    parameters: [
      { name: 'token', in: 'path', required: true, schema: { type: 'string' }, description: 'Session token' },
    ],
    responses: {
      '200': {
        description: 'Session revoked',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: { revoked: { type: 'boolean' }, currentSessionRevoked: { type: 'boolean' } },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing session token' },
      '401': { description: 'Not authenticated' },
      '404': { description: 'Session not found or failed to revoke' },
    },
  },
});

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE');

  const session = await requireAuth(event);

  const targetToken = getRouterParam(event, 'token');
  if (!targetToken) {
    throw createError({ status: 400, message: 'Missing session token' });
  }

  // getSessionCookie checks both the plain and `__Secure-`-prefixed cookie names,
  // matching whichever one auth.ts's useSecureCookies setting actually produced —
  // a hardcoded cookie name here would silently miss it in production.
  const currentToken = getSessionCookie(
    new Headers({ cookie: getRequestHeader(event, 'cookie') || '' }),
  );

  const result = await auth.api.revokeSession({
    body: { token: targetToken },
    headers: getAuthHeaders(event),
  });

  if (!result.status) {
    throw createError({ status: 404, message: 'Session not found or failed to revoke' });
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.id,
    actorType: 'user',
    action: 'account.session.revoke',
    targetType: 'session',
    targetId: targetToken,
    metadata: {
      isCurrentSession: currentToken === targetToken,
    },
  });

  return {
    data: {
      revoked: true,
      currentSessionRevoked: currentToken === targetToken,
    },
  };
});
