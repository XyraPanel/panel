import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { count, desc } from 'drizzle-orm';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const db = useDrizzle();
  const query = getQuery(event);
  const pageParam = Array.isArray(query.page) ? query.page[0] : query.page;
  const limitParam = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const page = Math.max(1, Number.parseInt(typeof pageParam === 'string' ? pageParam : '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(typeof limitParam === 'string' ? limitParam : '25', 10)),
  );
  const offset = (page - 1) * limit;

  const totalResult = await db
    .select({ count: count() })
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.userId, user.id));
  const total = totalResult[0]?.count ?? 0;

  const keys = await db
    .select({
      id: tables.sshKeys.id,
      name: tables.sshKeys.name,
      fingerprint: tables.sshKeys.fingerprint,
      publicKey: tables.sshKeys.publicKey,
      createdAt: tables.sshKeys.createdAt,
    })
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.userId, user.id))
    .orderBy(desc(tables.sshKeys.createdAt))
    .limit(limit)
    .offset(offset);

  const data = keys.map((key) => ({
    id: key.id,
    name: key.name,
    fingerprint: key.fingerprint,
    public_key: key.publicKey,
    created_at: key.createdAt,
  }));

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.ssh_keys.listed',
    targetType: 'user',
    targetId: user.id,
    metadata: { page, limit, total, returned: keys.length },
  });

  return {
    data,
    pagination: {
      page,
      perPage: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
