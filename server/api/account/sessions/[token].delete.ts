import { auth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAuth } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE');

  const session = await requireAuth(event);

  const targetToken = getRouterParam(event, 'token');
  if (!targetToken) {
    throw createError({ status: 400, statusText: 'Missing session token' });
  }

  const cookies = parseCookies(event);
  const currentToken = cookies['better-auth.session_token'];

  const result = await auth.api.revokeSession({
    body: { token: targetToken },
    headers: normalizeHeadersForAuth(event.node.req.headers),
  });

  if (!result.status) {
    throw createError({ status: 404, statusText: 'Session not found or failed to revoke' });
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
