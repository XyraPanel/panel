import { z } from 'zod';
import { getAuth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getValidatedQuery, requireAuth } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Revoke sessions',
    description: 'Terminates multiple active sessions for the authenticated user. Can optionally include the current session.',
    parameters: [
      {
        in: 'query',
        name: 'includeCurrent',
        schema: { type: 'boolean', default: false },
        description: 'Whether to also revoke the session currently being used',
      },
    ],
    responses: {
      200: {
        description: 'Sessions successfully revoked',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    revoked: { type: 'integer' },
                    currentSessionRevoked: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event);

  const query = await getValidatedQuery(
    event,
    z.object({
      includeCurrent: z.string().optional(),
    }),
  );
  const includeCurrent = query.includeCurrent === 'true';

  if (includeCurrent) {
    await getAuth().api.revokeOtherSessions({
      headers: getAuthHeaders(event),
    });

    const currentToken = getCookie(event, 'better-auth.session_token');
    if (currentToken) {
      await getAuth().api.revokeSession({
        body: { token: currentToken },
        headers: getAuthHeaders(event),
      });
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.id,
      actorType: 'user',
      action: 'account.session.revoke_all',
      targetType: 'session',
      targetId: null,
      metadata: {
        includeCurrent: true,
      },
    });

    return {
      data: {
        revoked: 1,
        currentSessionRevoked: true,
      },
    };
  }

  await getAuth().api.revokeOtherSessions({
    headers: getAuthHeaders(event),
  });

  await recordAuditEventFromRequest(event, {
    actor: session.user.id,
    actorType: 'user',
    action: 'account.session.revoke_others',
    targetType: 'session',
    targetId: null,
    metadata: {
      includeCurrent: false,
    },
  });

  return {
    data: {
      revoked: 1,
      currentSessionRevoked: false,
    },
  };
});
