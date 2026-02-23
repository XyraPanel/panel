import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { APIError } from 'better-auth/api';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.API_KEYS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );
  const keyId = getRouterParam(event, 'id');

  if (!keyId) {
    throw createError({
      status: 400,
      message: 'API key ID is required',
    });
  }

  const db = useDrizzle();
  const auth = getAuth();

  const keyResult = await db
    .select()
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.id, keyId))
    .limit(1);

  const key = keyResult[0];

  if (!key) {
    throw createError({
      status: 404,
      message: 'API key not found',
    });
  }

  try {
    await auth.api.deleteApiKey({
      body: { keyId },
      headers: normalizeHeadersForAuth(event.node.req.headers),
    });
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to delete API key',
      });
    }
    throw error;
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.api_key.deleted',
    targetType: 'api_key',
    targetId: keyId,
    metadata: {
      keyName: key.name,
      keyUserId: key.userId,
    },
  });

  return {
    data: {
      success: true,
      deletedId: keyId,
    },
  };
});
