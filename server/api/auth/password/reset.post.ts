import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { passwordResetPerformSchema } from '#shared/schema/account';

export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBodyWithLimit(
    event,
    passwordResetPerformSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const auth = getAuth();

  try {
    await auth.api.resetPassword({
      body: {
        token,
        newPassword: password,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });

    await recordAuditEventFromRequest(event, {
      actor: token,
      actorType: 'system',
      action: 'auth.password.reset.completed',
      targetType: 'user',
      targetId: null,
    });

    return { data: { success: true } };
  } catch (error) {
    if (error instanceof APIError) {
      throw createError({
        status: error.status,
        statusText: error.message || 'Invalid or expired password reset token',
      });
    }
    throw createError({
      status: 400,
      statusText: 'Invalid or expired password reset token',
    });
  }
});
