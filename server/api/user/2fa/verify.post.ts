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
    tags: ['Account'],
    summary: 'Verify 2FA code',
    description:
      'Verifies a TOTP code to complete the two-factor authentication setup for the authenticated user.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'The 6-digit TOTP code' },
              trustDevice: {
                type: 'boolean',
                default: false,
                description: 'Whether to trust this device for future logins',
              },
            },
            required: ['code'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '2FA successfully verified and enabled',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Invalid TOTP code' },
      401: { description: 'Authentication required' },
      500: { description: 'Internal server error' },
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
