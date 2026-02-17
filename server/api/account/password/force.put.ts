import { assertMethod, createError } from 'h3';
import { APIError } from 'better-auth/api';
import { useDrizzle, tables, eq, assertSqliteDatabase } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { accountForcedPasswordSchema } from '#shared/schema/account';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT');

  try {
    const accountContext = await requireAccountUser(event);
    const user = accountContext.user;

    const body = await readValidatedBodyWithLimit(
      event,
      accountForcedPasswordSchema,
      BODY_SIZE_LIMITS.SMALL,
    );

    const db = useDrizzle();
    assertSqliteDatabase(db);
    const auth = getAuth();
    const headers = normalizeHeadersForAuth(event.node.req.headers);

    const existing = db
      .select({
        passwordResetRequired: tables.users.passwordResetRequired,
      })
      .from(tables.users)
      .where(eq(tables.users.id, user.id))
      .get();

    if (!existing) {
      throw createError({ status: 404, statusText: 'Not Found', message: 'User not found' });
    }

    if (!existing.passwordResetRequired) {
      throw createError({
        status: 400,
        statusText: 'Bad Request',
        message: 'Password reset not required',
      });
    }

    const verifyResult = await auth.api.verifyPassword({
      body: { password: body.newPassword },
      headers,
    });
    if (verifyResult?.status) {
      throw createError({
        status: 400,
        statusText: 'Bad Request',
        message: 'Choose a different password',
      });
    }

    await auth.api.setPassword({
      body: { newPassword: body.newPassword },
      headers,
    });

    const now = new Date();

    db.update(tables.users)
      .set({
        passwordResetRequired: false,
        updatedAt: now,
      })
      .where(eq(tables.users.id, user.id))
      .run();

    const revokedSessions = db
      .delete(tables.sessions)
      .where(eq(tables.sessions.userId, user.id))
      .run();

    const revokedCount = typeof revokedSessions.changes === 'number' ? revokedSessions.changes : 0;

    await recordAuditEventFromRequest(event, {
      actor: user.email || user.id,
      actorType: 'user',
      action: 'account.password.force_update',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        revokedSessions: revokedCount,
      },
    });

    return {
      success: true,
      revokedSessions: revokedCount,
    };
  }
  catch (error) {
  if (error instanceof APIError) {
    const statusCode = typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500
    throw createError({
      statusCode,
      statusMessage: error.message || 'Failed to update password',
    })
  }

  throw error
  }
});
