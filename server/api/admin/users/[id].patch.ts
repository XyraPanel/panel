import { APIError } from 'better-auth/api';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { auth, normalizeHeadersForAuth } from '#server/utils/auth';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { z } from 'zod';

const patchUserSchema = z.object({
  username: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().trim().max(511).optional(),
  nameFirst: z.string().trim().max(255).optional(),
  nameLast: z.string().trim().max(255).optional(),
  language: z.string().trim().max(10).optional(),
  rootAdmin: z.boolean().optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'User ID is required' });
  }

  const rawBody = await readValidatedBodyWithLimit(event, patchUserSchema, BODY_SIZE_LIMITS.SMALL);

  try {
    let body = rawBody;
    if (body.name !== undefined && body.nameFirst === undefined && body.nameLast === undefined) {
      const parts = body.name.trim().split(/\s+/);
      body = { ...body, nameFirst: parts[0] || '', nameLast: parts.slice(1).join(' ') || '' };
    }

    const db = useDrizzle();
    const headers = normalizeHeadersForAuth(event.node.req.headers);

    if (body.email !== undefined) {
      const currentUserResult = await db
        .select({ email: tables.users.email })
        .from(tables.users)
        .where(eq(tables.users.id, userId))
        .limit(1);

      const currentUser = currentUserResult[0];
      if (currentUser && currentUser.email !== body.email) {
        await db
          .update(tables.users)
          .set({
            email: body.email,
            emailVerified: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.users.id, userId));
      }
    }

    if (body.role !== undefined) {
      await auth.api.setRole({
        body: { userId, role: body.role },
        headers,
      });

      await db
        .update(tables.users)
        .set({
          role: body.role,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.users.id, userId));
    }

    if (body.password) {
      await auth.api.setUserPassword({
        body: {
          userId,
          newPassword: body.password,
        },
        headers,
      });

      await db
        .update(tables.users)
        .set({
          passwordResetRequired: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.users.id, userId));
    }

    if (
      body.username !== undefined ||
      body.rootAdmin !== undefined ||
      body.nameFirst !== undefined ||
      body.nameLast !== undefined
    ) {
      const updates: Partial<typeof tables.users.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };

      if (body.username !== undefined) updates.username = body.username;
      if (body.rootAdmin !== undefined) updates.rootAdmin = body.rootAdmin;
      if (body.nameFirst !== undefined) updates.nameFirst = body.nameFirst || null;
      if (body.nameLast !== undefined) updates.nameLast = body.nameLast || null;

      await db.update(tables.users).set(updates).where(eq(tables.users.id, userId));
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.updated',
      targetType: 'user',
      targetId: userId,
      metadata: {
        fields: Object.keys(body),
      },
    });

    const updatedUserResult = await db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        nameFirst: tables.users.nameFirst,
        nameLast: tables.users.nameLast,
        role: tables.users.role,
        createdAt: tables.users.createdAt,
      })
      .from(tables.users)
      .where(eq(tables.users.id, userId))
      .limit(1);

    const updatedUser = updatedUserResult[0];

    if (!updatedUser) {
      throw createError({
        status: 404,
        statusText: 'Not Found',
        message: 'User not found after update',
      });
    }

    return {
      data: {
        id: updatedUser.id,
        username: updatedUser.username || updatedUser.email,
        email: updatedUser.email,
        name: [updatedUser.nameFirst, updatedUser.nameLast].filter(Boolean).join(' ') || null,
        role: updatedUser.role || 'user',
        createdAt: updatedUser.createdAt || new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to update user',
      });
    }
    throw createError({
      status: 500,
      statusText: 'Failed to update user',
    });
  }
});
