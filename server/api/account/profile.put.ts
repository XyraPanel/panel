import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { accountProfileUpdateSchema } from '#shared/schema/account';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { APIError } from 'better-auth/api';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { isEmailConfigured } from '#server/utils/email';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Update account profile',
    description:
      'Updates the authenticated account\'s username and/or email. Changing the email requires currentPassword and may trigger a verification email if email is configured.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              username: { type: 'string', minLength: 3, maxLength: 191 },
              email: { type: 'string', format: 'email', maxLength: 191 },
              currentPassword: { type: 'string', minLength: 8, description: 'Required when changing email' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Profile updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Invalid input, incorrect password, or unable to update profile' },
      '401': { description: 'Not authenticated' },
      '404': { description: 'User not found' },
      '409': { description: 'Username already in use' },
    },
  },
});

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
  const headers = getAuthHeaders(event);

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
    throw createError({ status: 404, message: 'User not found' });
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
          message: 'Conflict: Username already in use',
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
      try {
        const verification = await auth.api.verifyPassword({
          body: { password: body.currentPassword! },
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
            message: error.message || 'Invalid password',
          });
        }
        throw error;
      }

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
              message: error.message || 'Failed to request email change',
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
      throw createError({ status: 404, message: 'User not found after update' });
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
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    throw createError({
      status: 400,
      message: error instanceof Error ? error.message : 'Unable to update profile',
    });
  }
});
