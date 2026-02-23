import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const db = useDrizzle();
  const keys = await db.select().from(tables.sshKeys).where(eq(tables.sshKeys.userId, user.id));

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
    metadata: { count: keys.length },
  });

  return { data };
});
