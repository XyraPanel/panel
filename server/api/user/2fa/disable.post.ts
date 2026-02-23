import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorDisableSchema } from '#shared/schema/account';

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAccountUser(event);
  const { password } = await readValidatedBodyWithLimit(
    event,
    twoFactorDisableSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const auth = getAuth();
  const userId = sessionUser.id;

  try {
    await auth.api.disableTwoFactor({
      body: { password },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });

    await recordAuditEventFromRequest(event, {
      actor: sessionUser.email || sessionUser.id,
      actorType: 'user',
      action: 'auth.2fa.disabled',
      targetType: 'user',
      targetId: userId,
    });

    return {
      data: {
        success: true,
        message: '2FA disabled successfully',
      },
    };
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to disable 2FA',
      });
    }

    throw createError({
      status: 500,
      statusText: 'Failed to disable 2FA',
    });
  }
});
