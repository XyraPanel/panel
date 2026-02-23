import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { verifyRecoveryToken } from '#server/utils/totp';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { twoFactorRecoverySchema } from '#shared/schema/account';

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);
  const { token } = await readValidatedBodyWithLimit(
    event,
    twoFactorRecoverySchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const userId = user.id;
  const db = useDrizzle();

  const recoveryTokens = await db
    .select()
    .from(tables.recoveryTokens)
    .where(eq(tables.recoveryTokens.userId, userId));

  let matchedTokenId: string | null = null;

  for (const rt of recoveryTokens) {
    if (rt.usedAt) continue;

    const isValid = await verifyRecoveryToken(token, rt.token);
    if (isValid) {
      matchedTokenId = rt.id;
      break;
    }
  }

  if (!matchedTokenId) {
    throw createError({
      status: 400,
      message: 'Invalid recovery token',
    });
  }

  const now = new Date();
  await db
    .update(tables.recoveryTokens)
    .set({ usedAt: now })
    .where(eq(tables.recoveryTokens.id, matchedTokenId));

  await db
    .update(tables.users)
    .set({
      totpAuthenticatedAt: now,
      updatedAt: now,
    })
    .where(eq(tables.users.id, userId));

  await recordAuditEventFromRequest(event, {
    actor: user.email || user.id,
    actorType: 'user',
    action: 'auth.2fa.recovery.used',
    targetType: 'user',
    targetId: userId,
    metadata: { tokenId: matchedTokenId },
  });

  return {
    data: {
      success: true,
      message: 'Recovery token validated successfully',
    },
  };
});
