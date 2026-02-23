import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { accountProfileUpdateSchema } from '#shared/schema/account';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { APIError } from 'better-auth/api';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { isEmailConfigured } from '#server/utils/email';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT');

  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const body = await readValidatedBodyWithLimit(
    event,
    accountProfileUpdateSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  const auth = getAuth();
  const headers = normalizeHeadersForAuth(event.node.req.headers);

  const currentUserResult = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      role: tables.users.role,
    })
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .limit(1);

  const currentUser = currentUserResult[0];

  if (!currentUser) {
    throw createError({ status: 404, statusText: 'User not found' });
  }

  const oldUsername = currentUser.username;
  const oldEmail = currentUser.email;

  try {
    if (body.username !== undefined && body.username !== oldUsername) {
      const existingUserResult = await db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(eq(tables.users.username, body.username))
        .limit(1);

      const existingUser = existingUserResult[0];

      if (existingUser && existingUser.id !== user.id) {
        throw createError({
          status: 409,
          statusText: 'Conflict',
          message: 'Username already in use',
        });
      }

      await db
        .update(tables.users)
        .set({
          username: body.username,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.users.id, user.id));

      await recordAuditEventFromRequest(event, {
        actor: user.id,
        actorType: 'user',
        action: 'account.username.update',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          oldUsername: oldUsername || null,
          newUsername: body.username,
        },
      });
    }

    if (body.email !== undefined && body.email !== oldEmail) {
      const emailEnabled = await isEmailConfigured();

      if (emailEnabled) {
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
      } else {
        await db
          .update(tables.users)
          .set({
            email: body.email,
            emailVerified: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.users.id, user.id));
      }

      await recordAuditEventFromRequest(event, {
        actor: user.id,
        actorType: 'user',
        action: emailEnabled ? 'account.email.change_requested' : 'account.email.updated',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          oldEmail: oldEmail || null,
          newEmail: body.email,
        },
      });
    }

    const updatedUserResult = await db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        role: tables.users.role,
      })
      .from(tables.users)
      .where(eq(tables.users.id, user.id))
      .limit(1);

    const updatedUser = updatedUserResult[0];

    if (!updatedUser) {
      throw createError({ status: 404, statusText: 'User not found after update' });
    }

    return {
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role || 'user',
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unable to update profile';
    throw createError({
      status: 400,
      statusText: message,
    });
  }
});
