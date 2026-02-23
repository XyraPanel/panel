import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { resolvePanelBaseUrl } from '#server/utils/email';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { passwordRequestSchema } from '#shared/schema/account';

export default defineEventHandler(async (event) => {
  const { identity: rawIdentity } = await readValidatedBodyWithLimit(
    event,
    passwordRequestSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const identity = rawIdentity.toLowerCase();

  const db = useDrizzle();
  const [user] = await db
    .select({ id: tables.users.id, email: tables.users.email })
    .from(tables.users)
    .where(or(eq(tables.users.email, identity), eq(tables.users.username, identity)))
    .limit(1);

  if (!user?.email) {
    return {
      data: {
        success: true,
        message: 'If an account matches, a password reset email has been sent.',
      },
    };
  }

  const auth = getAuth();
  const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`;

  const captchaToken = getHeader(event, 'x-captcha-response');
  const authHeaders = normalizeHeadersForAuth(event.node.req.headers);
  if (captchaToken) {
    authHeaders['x-captcha-response'] = captchaToken;
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: resetBaseUrl,
      },
      headers: authHeaders,
    });

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'auth.password.reset.requested',
      targetType: 'user',
      targetId: user.id,
      metadata: { identity },
    });
  } catch (error) {
    if (error instanceof APIError) {
      console.error('Failed to send password reset email', {
        status: error.status,
        message: error.message,
      });
    } else {
      console.error('Failed to send password reset email', error);
    }
  }

  return {
    data: {
      success: true,
      message: 'If an account matches, a password reset email has been sent.',
    },
  };
});
