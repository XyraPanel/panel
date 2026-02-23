import { useDrizzle, tables, eq, inArray } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const db = useDrizzle();

  const keys = await db
    .select({
      id: tables.apiKeys.id,
      name: tables.apiKeys.name,
      expiresAt: tables.apiKeys.expiresAt,
      createdAt: tables.apiKeys.createdAt,
    })
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user.id))
    .orderBy(tables.apiKeys.createdAt);

  if (!keys.length) {
    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'account.api_keys.listed',
      targetType: 'user',
      targetId: user.id,
      metadata: { count: 0 },
    });

    return { data: [] };
  }

  const keyIds = keys.map((key) => key.id);

  const keyPermissions = await db
    .select({
      apiKeyId: tables.apiKeyMetadata.apiKeyId,
      memo: tables.apiKeyMetadata.memo,
      allowedIps: tables.apiKeyMetadata.allowedIps,
      lastUsedAt: tables.apiKeyMetadata.lastUsedAt,
    })
    .from(tables.apiKeyMetadata)
    .where(inArray(tables.apiKeyMetadata.apiKeyId, keyIds));

  const permsByKeyId = new Map(keyPermissions.map((p) => [p.apiKeyId, p]));

  const data = keys.map((key) => {
    const perms = permsByKeyId.get(key.id);

    let allowedIps: string[] = [];
    if (perms?.allowedIps) {
      if (typeof perms.allowedIps === 'string') {
        try {
          const parsed = JSON.parse(perms.allowedIps);
          allowedIps = Array.isArray(parsed) ? parsed : [];
        } catch {
          allowedIps = perms.allowedIps
            .split(',')
            .map((ip: string) => ip.trim())
            .filter(Boolean);
        }
      } else if (Array.isArray(perms.allowedIps)) {
        allowedIps = perms.allowedIps;
      }
    }

    return {
      identifier: key.id,
      description: perms?.memo || key.name || null,
      allowed_ips: allowedIps,
      last_used_at: perms?.lastUsedAt || null,
      created_at: key.createdAt,
    };
  });

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.api_keys.listed',
    targetType: 'user',
    targetId: user.id,
    metadata: { count: keys.length },
  });

  return { data };
});
