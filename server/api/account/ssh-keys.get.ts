import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { z } from 'zod';
import { count, desc } from 'drizzle-orm';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getValidatedQuery, requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const db = useDrizzle();
  const { page, limit } = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().min(1).catch(1).default(1),
      limit: z.coerce.number().min(1).max(100).catch(50).default(50),
    }),
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
