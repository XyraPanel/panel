import { APIError } from 'better-auth/api';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorEnableSchema } from '#shared/schema/account';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Initiate 2FA enablement',
    description: 'Starts the process of enabling two-factor authentication by generating a TOTP URI and backup/recovery codes. Requires current password verification.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              password: { type: 'string', format: 'password', description: 'Current account password for verification' },
              issuer: { type: 'string', description: 'Optional name of the issuer (e.g., XyraPanel)' },
            },
            required: ['password'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '2FA setup initiated successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    uri: { type: 'string', description: 'The TOTP provision URI (use this for generating QR codes)' },
                    secret: { type: 'string', description: 'The raw TOTP secret key' },
                    recoveryTokens: { type: 'array', items: { type: 'string' } },
                    backupCodes: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Invalid password or request' },
      401: { description: 'Authentication required' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);

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
      headers: getAuthHeaders(event),
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
        message: error.message || 'Failed to enable 2FA',
      });
    }
    throw createError({
      status: 500,
      message: 'Failed to enable 2FA',
    });
  }
});
