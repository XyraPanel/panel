import { APIError } from 'better-auth/api';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { UpdateEmailResponse } from '#shared/types/account';
import { updateEmailSchema } from '#shared/schema/account';
import { auth, getAuthHeaders } from '#server/utils/auth';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Request email change',
    description: 'Initiates a request to change the authenticated user\'s email address. Requires current password verification.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email', description: 'The new email address' },
              password: { type: 'string', format: 'password', description: 'Current account password for verification' },
            },
            required: ['email', 'password'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Email change request successfully initiated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
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

export default defineEventHandler(async (event): Promise<UpdateEmailResponse> => {
  assertMethod(event, 'PUT');

  const { user } = await requireAccountUser(event);

  const body = await readValidatedBodyWithLimit(event, updateEmailSchema, BODY_SIZE_LIMITS.SMALL);

  const headers = getAuthHeaders(event);

  try {
    const verification = await auth.api.verifyPassword({
      body: { password: body.password },
      headers,
    });
    if (!verification?.status) {
      throw createError({ status: 400, message: 'Invalid password' });
    }
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Invalid password',
      });
    }
    throw error;
  }

  try {
    await auth.api.changeEmail({
      body: {
        newEmail: body.email,
        callbackURL: '/account/profile',
      },
      headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Failed to request email change',
      });
    }
    throw error;
  }

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.email.change_requested',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      oldEmail: user.email || null,
      newEmail: body.email,
    },
  });

  return { success: true };
});
