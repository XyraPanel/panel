import { APIError } from 'better-auth/api';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { passwordResetPerformSchema } from '#shared/schema/account';

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Reset password with token',
    description:
      'Completes the password reset process using a valid secret token and sets a new account password.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'The password reset token from the recovery email',
              },
              password: {
                type: 'string',
                format: 'password',
                description: 'The new account password to set',
              },
            },
            required: ['token', 'password'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Password successfully reset',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Invalid or expired reset token' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBodyWithLimit(
    event,
    passwordResetPerformSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    await auth.api.resetPassword({
      body: {
        token,
        newPassword: password,
      },
      headers: getAuthHeaders(event),
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
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    if (error instanceof APIError) {
      const statusCode = typeof error.status === 'number' ? error.status : 400;
      throw createError({
        status: statusCode,
        message: error.message || 'Invalid or expired password reset token',
      });
    }
    throw createError({
      status: 400,
      message: 'Invalid or expired password reset token',
    });
  }
});
