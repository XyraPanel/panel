import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { sendAdminUserCreatedEmail } from '#server/utils/email';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import bcrypt from 'bcryptjs';
import { generateId } from 'better-auth';

import { adminCreateUserSchema } from '#shared/schema/admin/users';
import { debugError } from '#server/utils/logger';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const body = await readValidatedBodyWithLimit(
    event,
    adminCreateUserSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const db = useDrizzle();
    const config = useRuntimeConfig();
    const now = new Date().toISOString();
    const defaultLanguage = config.DEFAULT_LANGUAGE || 'en';

    const existing = await db
      .select({ id: tables.users.id })
      .from(tables.users)
      .where(eq(tables.users.email, body.email))
      .limit(1);

    if (existing[0]) {
      throw createError({
        status: 409,
        message: 'Conflict: A user with this email already exists',
      });
    }

    const hashedPassword = await bcrypt.hash(body.password, 12);
    const userId = generateId();

    await db.insert(tables.users).values({
      id: userId,
      username: body.username,
      email: body.email,
      password: hashedPassword,
      language: body.language || defaultLanguage,
      rootAdmin: body.role === 'admin',
      role: body.role,
      nameFirst: body.nameFirst || null,
      nameLast: body.nameLast || null,
      emailVerified: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(tables.accounts).values({
      id: generateId(),
      userId,
      type: 'credential',
      provider: 'credential',
      providerAccountId: userId,
      accountId: userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await sendAdminUserCreatedEmail({
        to: body.email,
        username: body.username,
      });
    } catch (error) {
      debugError('Failed to send admin user created email:', error);
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.created',
      targetType: 'user',
      targetId: userId,
      metadata: {
        email: body.email,
        username: body.username,
        role: body.role,
      },
    });

    return {
      data: {
        id: userId,
        username: body.username,
        email: body.email,
        role: body.role,
        createdAt: now,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('Fatal error during admin user creation:', error);
    throw createError({
      status: 500,
      message: 'Failed to create user',
    });
  }
});
