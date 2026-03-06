import { APIError } from 'better-auth/api';
import { logger } from '#server/utils/logger';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { resolvePanelBaseUrl } from '#server/utils/email';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { passwordRequestSchema } from '#shared/schema/account';

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Request password reset',
    description: 'Initiates a password reset flow by sending a reset email to the associated account. Returns a generic success message to prevent user enumeration.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              identity: { type: 'string', description: 'The email or username of the account to reset' },
            },
            required: ['identity'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Success message returned',
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
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const { identity: rawIdentity } = await readValidatedBodyWithLimit(
    event,
    passwordRequestSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const identity = rawIdentity.toLowerCase();

  const db = useDrizzle();
  const [user] = await db
    .select({ id: tables.users.id, email: tables.users.email })
    .from(tables.users)
    .where(or(eq(tables.users.email, identity), eq(tables.users.username, identity)))
    .limit(1);

  if (!user?.email) {
    return {
      data: {
        success: true,
        message: 'If an account matches, a password reset email has been sent.',
      },
    };
  }

  const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`;

  const captchaToken = getHeader(event, 'x-captcha-response');
  const authHeaders = getAuthHeaders(event);
  if (captchaToken) {
    authHeaders['x-captcha-response'] = captchaToken;
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: resetBaseUrl,
      },
      headers: authHeaders,
    });

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'auth.password.reset.requested',
      targetType: 'user',
      targetId: user.id,
      metadata: { identity },
    });
  } catch (error) {
    if (error instanceof APIError) {
      logger.error('Failed to send password reset email', {
        status: error.status,
        message: error.message,
      });
    } else {
      logger.error('Failed to send password reset email', error);
    }
  }

  return {
    data: {
      success: true,
      message: 'If an account matches, a password reset email has been sent.',
    },
  };
});
