import { APIError } from 'better-auth/api';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorVerifySchema } from '#shared/schema/account';

defineRouteMeta({
  openAPI: {
    tags: ['User - 2FA'],
    summary: 'Confirm two-factor authentication setup',
    description:
      'Verifies a TOTP code against a pending 2FA setup, activating 2FA on the authenticated account.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['code'],
            properties: {
              code: { type: 'string', description: 'TOTP code from the authenticator app' },
              trustDevice: { type: 'boolean' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: '2FA enabled',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { data: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } } },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '500': { description: 'Invalid TOTP code' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);

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
      headers: getAuthHeaders(event),
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
        message: error.message || 'Invalid TOTP code',
      });
    }
    throw createError({
      status: 500,
      message: 'Failed to verify TOTP code',
    });
  }
});
