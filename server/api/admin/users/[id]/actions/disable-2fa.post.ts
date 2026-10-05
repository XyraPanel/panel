import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { disableTwoFactorActionSchema } from '#shared/schema/admin/actions';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Users'],
    summary: 'Disable two-factor authentication for a user',
    description:
      'Sensitive action: forcibly disables two-factor authentication for the target user, clearing their TOTP secret and any pending recovery tokens. Requires an admin session with the users:write ACL permission.',
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
      required: false,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              reason: { type: 'string', minLength: 1, maxLength: 500, description: 'Reason for disabling 2FA' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: '2FA disabled (or already disabled)',
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
      '400': { description: 'User ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing users:write ACL permission' },
      '404': { description: 'User not found' },
      '500': { description: 'Failed to disable 2FA for the user' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, message: 'User ID is required' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    disableTwoFactorActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const existingResult = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      twoFactorEnabled: tables.users.twoFactorEnabled,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  const existing = existingResult[0];

  if (!existing) {
    throw createError({ status: 404, message: 'User not found' });
  }

  try {
    await db
      .update(tables.users)
      .set({
        twoFactorEnabled: false,
        useTotp: false,
        totpSecret: null,
        totpAuthenticatedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.users.id, userId));

    await db.delete(tables.twoFactor).where(eq(tables.twoFactor.userId, userId));

    await db.delete(tables.recoveryTokens).where(eq(tables.recoveryTokens.userId, userId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.disable_2fa',
      targetType: 'user',
      targetId: userId,
      metadata: body.reason
        ? {
            reason: body.reason,
          }
        : undefined,
    });
    return {
      data: {
        success: true,
        message: existing.twoFactorEnabled
          ? 'Two-factor authentication has been disabled for the user.'
          : 'Two-factor authentication was already disabled.',
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Disable 2FA] Failed for user:', userId, error);
    throw createError({
      status: 500,
      message: 'Failed to disable 2FA for the user',
    });
  }
});
