import { auth, getAuthHeaders } from '#server/utils/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { emailVerificationActionSchema } from '~~/shared/schema/admin/users';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

import { debugError } from '#server/utils/logger';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, message: 'User ID is required' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    emailVerificationActionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const [user] = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      username: tables.users.username,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  if (!user) {
    throw createError({ status: 404, message: 'User not found' });
  }

  try {
    switch (body.action) {
      case 'mark-verified': {
        const nowIso = new Date().toISOString();
        await db
          .update(tables.users)
          .set({
            emailVerified: nowIso,
            updatedAt: nowIso,
          })
          .where(eq(tables.users.id, userId));
        break;
      }
      case 'mark-unverified': {
        await db
          .update(tables.users)
          .set({
            emailVerified: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.users.id, userId));
        break;
      }
      case 'resend-link': {
        if (!user.email) {
          throw createError({
            status: 400,
            message: 'User is missing an email address',
          });
        }

        try {
          if (typeof auth.api.sendVerificationEmail === 'function') {
            await auth.api.sendVerificationEmail({
              body: {
                email: user.email,
              },
              headers: getAuthHeaders(event),
            });
          } else {
            const { sendEmailVerificationEmail } = await import('#server/utils/email');
            const { createEmailVerificationToken } =
              await import('#server/utils/email-verification');

            const { token, expiresAt } = await createEmailVerificationToken(user.id);
            await sendEmailVerificationEmail({
              to: user.email,
              token,
              expiresAt,
              username: user.username || undefined,
            });
          }
        } catch {
          const { sendEmailVerificationEmail } = await import('#server/utils/email');
          const { createEmailVerificationToken } = await import('#server/utils/email-verification');

          const { token, expiresAt } = await createEmailVerificationToken(user.id);
          await sendEmailVerificationEmail({
            to: user.email,
            token,
            expiresAt,
            username: user.username || undefined,
          });
        }
        break;
      }
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: `admin.user.email.${body.action}`,
      targetType: 'user',
      targetId: userId,
      metadata: {
        action: body.action,
        userEmail: user.email ?? undefined,
      },
    });

    return {
      data: {
        success: true,
        action: body.action,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Email Verification Action] Failed for user:', userId, error);
    throw createError({
      status: 500,
      message: 'Failed to perform email verification action',
    });
  }
});
