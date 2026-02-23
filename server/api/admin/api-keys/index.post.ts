import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { CreateApiKeyResponse } from '#shared/types/admin';
import { createAdminApiKeySchema } from '#shared/schema/admin/api-keys';
import type { AdminApiKeyPermissionAction } from '#shared/schema/admin/api-keys';
import { APIError } from 'better-auth/api';
import { getAuth } from '#server/utils/auth';
type PermissionAction = AdminApiKeyPermissionAction;

export default defineEventHandler(async (event): Promise<{ data: CreateApiKeyResponse }> => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.API_KEYS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const user = session.user;

  if (!user || !user.id) {
    throw createError({
      status: 401,
      statusText: 'User not found in session',
    });
  }

  const db = useDrizzle();

  const dbUserResult = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .limit(1);
  if (!dbUserResult[0]) {
    throw createError({
      status: 404,
      statusText: 'User not found in database. Please log out and log back in.',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    createAdminApiKeySchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const trimmedMemo = body.memo?.trim() || null;
  const permissions: Record<string, PermissionAction[]> = body.permissions ?? {};
  const auth = getAuth();

  const now = new Date().toISOString();

  let expiresIn: number | undefined;
  if (body.expiresAt) {
    const expiresAtMs = new Date(body.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw createError({
        status: 400,
        statusText: 'Bad Request',
        message: 'expiresAt must be a valid future datetime',
      });
    }
    expiresIn = Math.floor((expiresAtMs - Date.now()) / 1000);
  }

  let created: Awaited<ReturnType<typeof auth.api.createApiKey>>;
  try {
    created = await auth.api.createApiKey({
      body: {
        name: trimmedMemo || 'API Key',
        userId: user.id,
        ...(expiresIn ? { expiresIn } : {}),
        permissions,
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to create API key',
      });
    }
    throw error;
  }

  const apiKeyId = created.id;

  await db.insert(tables.apiKeyMetadata).values({
    id: randomUUID(),
    apiKeyId: apiKeyId,
    keyType: 1,
    allowedIps: body.allowedIps ? JSON.stringify(body.allowedIps) : null,
    memo: trimmedMemo,
    createdAt: now,
    updatedAt: now,
  });

  const permissionValues = Object.values(permissions);
  const hasAnyPermissions = permissionValues.some(
    (actions) => Array.isArray(actions) && actions.length > 0,
  );

  if (hasAnyPermissions) {
    await db
      .update(tables.apiKeys)
      .set({
        metadata: JSON.stringify(permissions),
      })
      .where(eq(tables.apiKeys.id, apiKeyId));
  }

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'admin.api_key.create',
    targetType: 'api_key',
    targetId: apiKeyId,
    metadata: {
      identifier: created.start || apiKeyId,
      memo: trimmedMemo,
      allowedIpsCount: body.allowedIps?.length || 0,
      permissions,
    },
  });

  return {
    data: {
      id: apiKeyId,
      identifier: created.start || apiKeyId,
      apiKey: created.key,
      memo: trimmedMemo,
      createdAt: now,
    },
  };
});
