import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorVerifySchema } from '#shared/schema/account';

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);
  const auth = getAuth();

  const { code, trustDevice } = await readValidatedBodyWithLimit(
    event,
    twoFactorVerifySchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    await auth.api.verifyTOTP({
      body: {
        code,
        trustDevice,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });

    await recordAuditEventFromRequest(event, {
      actor: user.email || user.id,
      actorType: 'user',
      action: 'auth.2fa.enabled',
      targetType: 'user',
      targetId: user.id,
    });

    return {
      data: {
        success: true,
        message: '2FA enabled successfully',
      },
    };
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Invalid TOTP code',
      });
    }
    throw createError({
      status: 500,
      statusText: 'Failed to verify TOTP code',
    });
  }
});
