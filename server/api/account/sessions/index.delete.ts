import { auth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAuth } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event);

  const query = getQuery(event);
  const includeCurrent = query.includeCurrent === 'true';

  if (includeCurrent) {
    await auth.api.revokeOtherSessions({
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });

    const cookies = parseCookies(event);
    const currentToken = cookies['better-auth.session_token'];
    if (currentToken) {
      await auth.api.revokeSession({
        body: { token: currentToken },
        headers: normalizeHeadersForAuth(event.node.req.headers),
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

  await auth.api.revokeOtherSessions({
    headers: normalizeHeadersForAuth(event.node.req.headers),
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
