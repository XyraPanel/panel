import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { disableTwoFactorActionSchema } from '#shared/schema/admin/actions';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'User ID is required' });
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
    throw createError({ status: 404, statusText: 'Not Found', message: 'User not found' });
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
    const message = error instanceof Error ? error.message : 'Failed to disable 2FA';
    throw createError({
      status: 500,
      statusText: message,
    });
  }
});
