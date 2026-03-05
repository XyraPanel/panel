import { APIError } from 'better-auth/api';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

import { adminUpdateUserSchema } from '#shared/schema/admin/users';

import { debugError } from '#server/utils/logger';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      message: 'User ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    adminUpdateUserSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const { username, email, password, nameFirst, nameLast, language, rootAdmin, role } = body;

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();

    const userRecordResult = await db
      .select({
        id: tables.users.id,
        email: tables.users.email,
        username: tables.users.username,
        role: tables.users.role,
      })
      .from(tables.users)
      .where(eq(tables.users.id, id))
      .limit(1);

    let userRecord = userRecordResult[0];

    if (!userRecord) {
      throw createError({ status: 404, message: 'User not found' });
    }

    const changedFields = new Set<string>();

    if (email !== undefined) {
      if (userRecord.email !== email) {
        await db
          .update(tables.users)
          .set({
            email,
            emailVerified: null,
            updatedAt: now,
          })
          .where(eq(tables.users.id, id));
        userRecord = { ...userRecord, email };
        changedFields.add('email');
      }
    }

    const headers = getAuthHeaders(event);

    if (role !== undefined && userRecord.role !== role) {
      await auth.api.setRole({
        body: { userId: id, role: role },
        headers: getAuthHeaders(event),
      });

      await db
        .update(tables.users)
        .set({
          role,
          updatedAt: now,
        })
        .where(eq(tables.users.id, id));
      changedFields.add('role');
    }

    if (password) {
      await auth.api.setUserPassword({
        body: { userId: id, newPassword: password },
        headers,
      });

      await db
        .update(tables.users)
        .set({
          passwordResetRequired: false,
          updatedAt: now,
        })
        .where(eq(tables.users.id, id));
      changedFields.add('password');
    }

    const updates: Partial<typeof tables.users.$inferInsert> = {
      updatedAt: now,
    };

    if (username !== undefined) {
      updates.username = username;
      changedFields.add('username');
    }

    if (language !== undefined) {
      updates.language = language;
      changedFields.add('language');
    }

    if (rootAdmin !== undefined) {
      updates.rootAdmin = Boolean(rootAdmin);
      changedFields.add('rootAdmin');
    }

    if (nameFirst !== undefined) {
      updates.nameFirst = nameFirst || null;
      changedFields.add('nameFirst');
    }

    if (nameLast !== undefined) {
      updates.nameLast = nameLast || null;
      changedFields.add('nameLast');
    }

    if (Object.keys(updates).length > 1) {
      await db.update(tables.users).set(updates).where(eq(tables.users.id, id));
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.updated',
      targetType: 'user',
      targetId: id,
      metadata: {
        fields: Array.from(changedFields),
      },
    });

    const updatedResult = await db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        nameFirst: tables.users.nameFirst,
        nameLast: tables.users.nameLast,
        language: tables.users.language,
        rootAdmin: tables.users.rootAdmin,
        role: tables.users.role,
        emailVerified: tables.users.emailVerified,
        image: tables.users.image,
        createdAt: tables.users.createdAt,
        updatedAt: tables.users.updatedAt,
      })
      .from(tables.users)
      .where(eq(tables.users.id, id))
      .limit(1);

    const user = updatedResult[0];

    if (!user) {
      throw createError({ status: 404, message: 'User not found' });
    }

    return {
      data: user,
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Failed to update user',
      });
    }
    debugError('[Admin User Update] Fatal failure for user:', id, error);
    throw createError({
      status: 500,
      message: 'Failed to update user',
    });
  }
});
