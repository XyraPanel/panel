import { auth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAuth } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Revoke session',
    description: 'Terminates a specific active session identified by its token for the authenticated user.',
    parameters: [
      {
        in: 'path',
        name: 'token',
        required: true,
        schema: { type: 'string' },
        description: 'The session token to revoke',
      },
    ],
    responses: {
      200: {
        description: 'Session successfully revoked',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    revoked: { type: 'boolean' },
                    currentSessionRevoked: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing session token' },
      401: { description: 'Authentication required' },
      404: { description: 'Session not found' },
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

  const cookies = parseCookies(event);
  const currentToken = cookies['better-auth.session_token'];

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
