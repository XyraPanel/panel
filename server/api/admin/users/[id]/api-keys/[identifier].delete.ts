import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE');
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user ID' });
  }

  const identifier = getRouterParam(event, 'identifier');
  if (!identifier) {
    throw createError({ status: 400, statusText: 'Missing API key identifier' });
  }

  const db = useDrizzle();

  const [targetUser] = await db
    .select({ id: tables.users.id, username: tables.users.username })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  if (!targetUser) {
    throw createError({ status: 404, statusText: 'User not found' });
  }

  const [apiKey] = await db
    .select({
      id: tables.apiKeys.id,
      identifier: tables.apiKeys.identifier,
      memo: tables.apiKeys.memo,
    })
    .from(tables.apiKeys)
    .where(and(eq(tables.apiKeys.identifier, identifier), eq(tables.apiKeys.userId, userId)))
    .limit(1);

  if (!apiKey) {
    throw createError({ status: 404, statusText: 'API key not found' });
  }

  await db.delete(tables.apiKeys).where(eq(tables.apiKeys.id, apiKey.id));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.user.api_key.delete',
    targetType: 'user',
    targetId: userId,
    metadata: {
      targetUserId: userId,
      targetUsername: targetUser.username,
      apiKeyIdentifier: identifier,
      apiKeyMemo: apiKey.memo,
      apiKeyId: apiKey.id,
    },
  });

  return {
    data: {
      success: true,
      userId,
      apiKeyIdentifier: identifier,
    },
  };
});
