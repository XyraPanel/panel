import { randomBytes } from 'node:crypto';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { resetPasswordActionSchema } from '#shared/schema/admin/actions';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { APIError } from 'better-auth/api';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Users'],
    summary: "Reset a user's password",
    description:
      'Sensitive/destructive action: either sends the target user a password reset link ("link" mode), or immediately sets a temporary password on their account and flags it as requiring a reset on next login ("temporary" mode). In temporary mode the plaintext temporary password is returned in the response. Requires an admin session with the users:write ACL permission.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID',
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['link', 'temporary'], default: 'link' },
              password: {
                type: 'string',
                minLength: 12,
                maxLength: 255,
                description: 'Optional explicit temporary password (temporary mode only); randomly generated if omitted',
              },
              notify: { type: 'boolean', default: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Password reset performed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    mode: { type: 'string', enum: ['link', 'temporary'] },
                    temporaryPassword: { type: 'string', description: 'Only present in temporary mode' },
                    notify: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'User ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing users:write ACL permission' },
      '404': { description: 'User not found' },
      '500': { description: 'Failed to reset password' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({
      status: 400,
      message: 'User ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    resetPasswordActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const mode = body.mode;
  const notify = body.notify;

  const db = useDrizzle();

  const userResult = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      username: tables.users.username,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw createError({ status: 404, message: 'User not found' });
  }

  try {
    if (mode === 'link') {
      const { resolvePanelBaseUrl } = await import('#server/utils/email');
      const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`;

      await auth.api.requestPasswordReset({
        body: {
          email: user.email,
          redirectTo: resetBaseUrl,
        },
        headers: getAuthHeaders(event),
      });

      await recordAuditEventFromRequest(event, {
        actor: session.user.email || session.user.id,
        actorType: 'user',
        action: 'admin.user.reset_password_link',
        targetType: 'user',
        targetId: userId,
        metadata: {
          mode,
          notify,
        },
      });

      return {
        data: {
          success: true,
          mode,
          notify,
        },
      };
    }

    const temporaryPassword = body.password?.trim() || randomBytes(9).toString('base64url');
    const headers = getAuthHeaders(event);

    await auth.api.setUserPassword({
      body: {
        userId,
        newPassword: temporaryPassword,
      },
      headers,
    });

    await db
      .update(tables.users)
      .set({
        passwordResetRequired: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.users.id, userId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.reset_password_temporary',
      targetType: 'user',
      targetId: userId,
      metadata: {
        mode,
        notify,
      },
    });

    return {
      data: {
        success: true,
        mode,
        temporaryPassword,
        notify,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Failed to reset password',
      });
    }
    debugError('[Admin User Reset Password Action] Failed for user:', userId, error);
    throw createError({
      status: 500,
      message: 'Failed to reset password',
    });
  }
});
