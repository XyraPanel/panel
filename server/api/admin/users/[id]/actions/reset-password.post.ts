import { randomBytes } from 'node:crypto';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { resetPasswordActionSchema } from '#shared/schema/admin/actions';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { APIError } from 'better-auth/api';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
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
    throw createError({ status: 404, statusText: 'Not Found', message: 'User not found' });
  }

  const auth = getAuth();

  try {
    if (mode === 'link') {
      const { resolvePanelBaseUrl } = await import('#server/utils/email');
      const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`;

      await auth.api.requestPasswordReset({
        body: {
          email: user.email,
          redirectTo: resetBaseUrl,
        },
        headers: normalizeHeadersForAuth(event.node.req.headers),
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
    const headers = normalizeHeadersForAuth(event.node.req.headers);

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
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to reset password',
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to reset password';
    throw createError({
      status: 500,
      statusText: message,
    });
  }
});
