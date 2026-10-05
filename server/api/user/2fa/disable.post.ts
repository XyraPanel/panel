import { APIError } from 'better-auth/api';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorDisableSchema } from '#shared/schema/account';

defineRouteMeta({
  openAPI: {
    tags: ['User - 2FA'],
    summary: 'Disable two-factor authentication',
    description: 'Disables TOTP-based 2FA for the authenticated account, verifying the current password.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['password'],
            properties: { password: { type: 'string' } },
          },
        },
      },
    },
    responses: {
      '200': {
        description: '2FA disabled',
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
      '500': { description: 'Failed to disable 2FA (e.g. incorrect password)' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAccountUser(event);
  const { password } = await readValidatedBodyWithLimit(
    event,
    twoFactorDisableSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const userId = sessionUser.id;

  try {
    await auth.api.disableTwoFactor({
      body: { password },
      headers: getAuthHeaders(event),
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
        message: error.message || 'Failed to disable 2FA',
      });
    }

    throw createError({
      status: 500,
      message: 'Failed to disable 2FA',
    });
  }
});
