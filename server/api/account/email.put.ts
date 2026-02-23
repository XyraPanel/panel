import { APIError } from 'better-auth/api';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { UpdateEmailResponse } from '#shared/types/account';
import { updateEmailSchema } from '#shared/schema/account';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';

export default defineEventHandler(async (event): Promise<UpdateEmailResponse> => {
  assertMethod(event, 'PUT');

  const { user } = await requireAccountUser(event);

  const body = await readValidatedBodyWithLimit(event, updateEmailSchema, BODY_SIZE_LIMITS.SMALL);

  const auth = getAuth();
  const headers = normalizeHeadersForAuth(event.node.req.headers);

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
        statusMessage: error.message || 'Invalid password',
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
        statusMessage: error.message || 'Failed to request email change',
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
