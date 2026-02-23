import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorEnableSchema } from '#shared/schema/account';

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);
  const auth = getAuth();

  const { password, issuer } = await readValidatedBodyWithLimit(
    event,
    twoFactorEnableSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const result = await auth.api.enableTwoFactor({
      body: {
        password,
        issuer,
      },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });

    const secretFromUri = result.totpURI ? result.totpURI.split('secret=')[1]?.split('&')[0] : null;

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'auth.2fa.setup.initiated',
      targetType: 'user',
      targetId: user.id,
    });

    return {
      data: {
        uri: result.totpURI,
        secret: secretFromUri || '',
        recoveryTokens: result.backupCodes || [],
        backupCodes: result.backupCodes || [],
      },
    };
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to enable 2FA',
      });
    }
    throw createError({
      status: 500,
      statusText: 'Failed to enable 2FA',
    });
  }
});
