import { APIError } from 'better-auth/api';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { resolveSessionUser } from '#server/utils/auth/sessionUser';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { accountPasswordUpdateSchema } from '#shared/schema/account';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT');

  const { session } = await requireAccountUser(event);

  if (!session?.user?.id) {
    throw createError({ status: 401, message: 'Unauthorized' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    accountPasswordUpdateSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: false,
      },
      headers: getAuthHeaders(event),
    });

    await auth.api.revokeSessions({
      headers: getAuthHeaders(event),
    });

    const resolvedUser = resolveSessionUser(session);
    if (resolvedUser) {
      await recordAuditEventFromRequest(event, {
        actor: resolvedUser.email || resolvedUser.id,
        actorType: 'user',
        action: 'account.password.update',
        targetType: 'user',
        targetId: resolvedUser.id,
      });
    }

    return {
      data: {
        success: true,
        revokedSessions: 1,
        signedOut: true,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    if (error instanceof APIError) {
      throw createError({
        status: Number(error.status) || 400,
        message: error.message || 'Failed to change password',
      });
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw createError({
      status: 400,
      message: msg,
    });
  }
});
