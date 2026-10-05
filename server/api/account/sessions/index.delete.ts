import { z } from 'zod';
import { getSessionCookie } from 'better-auth/cookies';
import { getAuth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getValidatedQuery, requireAuth } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Revoke sessions',
    description:
      'Revokes other active sessions for the authenticated account. Pass includeCurrent=true to also revoke the current session (signs the user out).',
    parameters: [
      {
        name: 'includeCurrent',
        in: 'query',
        schema: { type: 'string', enum: ['true', 'false'] },
        description: 'Set to "true" to also revoke the current session',
      },
    ],
    responses: {
      '200': {
        description: 'Sessions revoked',
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
      '401': { description: 'Not authenticated' },
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

    // getSessionCookie checks both the plain and `__Secure-`-prefixed cookie names,
    // matching whichever one auth.ts's useSecureCookies setting actually produced —
    // a hardcoded cookie name here would silently miss it in production.
    const currentToken = getSessionCookie(
      new Headers({ cookie: getRequestHeader(event, 'cookie') || '' }),
    );
    let currentSessionRevoked = false;
    if (currentToken) {
      await getAuth().api.revokeSession({
        body: { token: currentToken },
        headers: getAuthHeaders(event),
      });
      currentSessionRevoked = true;
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.id,
      actorType: 'user',
      action: 'account.session.revoke_all',
      targetType: 'session',
      targetId: null,
      metadata: {
        includeCurrent: true,
        currentSessionRevoked,
      },
    });

    return {
      data: {
        revoked: 1,
        currentSessionRevoked,
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
