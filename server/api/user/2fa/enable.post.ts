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
    tags: ['User - 2FA'],
    summary: 'Begin two-factor authentication setup',
    description:
      'Verifies the current password and generates a new TOTP secret/URI plus backup codes for the authenticated account. 2FA is not active until confirmed via the verify endpoint.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['password'],
            properties: {
              password: { type: 'string' },
              issuer: { type: 'string', maxLength: 191 },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: '2FA setup initiated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    uri: { type: 'string', nullable: true },
                    secret: { type: 'string' },
                    recoveryTokens: { type: 'array', items: { type: 'string' } },
                    backupCodes: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '500': { description: 'Failed to enable 2FA (e.g. incorrect password)' },
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
