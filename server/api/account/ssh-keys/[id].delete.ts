import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

import { debugError } from '#server/utils/logger';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const { id } = getRouterParams(event);
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, message: 'Missing SSH key ID' });
  }

  try {
    const db = useDrizzle();

    const [key] = await db
      .select()
      .from(tables.sshKeys)
      .where(and(eq(tables.sshKeys.id, id), eq(tables.sshKeys.userId, user.id)))
      .limit(1);

    if (!key) {
      throw createError({ status: 404, message: 'SSH key not found' });
    }

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'account.ssh_key.delete',
      targetType: 'user',
      targetId: id,
      metadata: {
        name: key.name,
        fingerprint: key.fingerprint,
      },
    });

    await db.delete(tables.sshKeys).where(eq(tables.sshKeys.id, id));

    return {
      success: true,
      message: 'SSH key deleted successfully',
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[SSH Key Delete] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete SSH key',
    });
  }
});
