import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { suspensionActionSchema } from '#shared/schema/admin/actions';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'User ID is required' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    suspensionActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const auth = getAuth();
  const headers = normalizeHeadersForAuth(event.node.req.headers);
  const action = body.action === 'suspend' ? 'ban' : 'unban';
  const reason = (body.reason ?? '').trim();
  const banExpiresIn = action === 'ban' && body.banExpiresIn ? body.banExpiresIn : undefined;

  try {
    if (action === 'ban') {
      await auth.api.banUser({
        body: {
          userId,
          ...(reason.length > 0 ? { banReason: reason } : {}),
          ...(banExpiresIn ? { banExpiresIn } : {}),
        },
        headers,
      });
    } else {
      await auth.api.unbanUser({
        body: { userId },
        headers,
      });
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: action === 'ban' ? 'admin.user.suspend' : 'admin.user.unsuspend',
      targetType: 'user',
      targetId: userId,
      metadata:
        action === 'ban'
          ? {
              reason: reason.length > 0 ? reason : undefined,
              banExpiresIn,
            }
          : undefined,
    });

    return {
      data: {
        success: true,
        action: body.action,
        suspended: action === 'ban',
        reason: action === 'ban' ? (reason.length > 0 ? reason : null) : null,
      },
    };
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to update user status',
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to perform action';
    throw createError({
      statusCode: 500,
      statusMessage: message,
    });
  }
});
