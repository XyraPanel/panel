import { randomUUID } from 'node:crypto';
import { generateRawToken, hashToken } from '#server/utils/crypto';
import { useDrizzle, tables, eq, and, lt } from '#server/utils/drizzle';

const EMAIL_VERIFICATION_TOKEN_PREFIX = 'email-verify:';
const EMAIL_VERIFICATION_EXPIRATION_MS = 24 * 60 * 60 * 1000;

function buildIdentifier(userId: string): string {
  return `${EMAIL_VERIFICATION_TOKEN_PREFIX}${userId}`;
}

export async function createEmailVerificationToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const db = useDrizzle();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + EMAIL_VERIFICATION_EXPIRATION_MS);
  const identifier = buildIdentifier(userId);

  await db.delete(tables.verificationTokens).where(lt(tables.verificationTokens.expires, now));

  await db
    .delete(tables.verificationTokens)
    .where(eq(tables.verificationTokens.identifier, identifier));

  const rawToken = generateRawToken();
  const storedToken = hashToken(rawToken);

  await db.insert(tables.verificationTokens).values({
    id: randomUUID(),
    identifier,
    token: storedToken,
    value: null,
    expires: expiresAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdAt: now,
    updatedAt: now,
  });

  return { token: rawToken, expiresAt: expiresAt };
}

export async function consumeEmailVerificationToken(
  rawToken: string,
): Promise<{ userId: string } | null> {
  if (!rawToken || rawToken.length === 0) {
    return null;
  }

  const db = useDrizzle();
  const storedToken = hashToken(rawToken);
  const [record] = await db
    .select({
      identifier: tables.verificationTokens.identifier,
      token: tables.verificationTokens.token,
      expires: tables.verificationTokens.expires,
    })
    .from(tables.verificationTokens)
    .where(eq(tables.verificationTokens.token, storedToken))
    .limit(1);

  if (!record) {
    return null;
  }

  const identifier = record.identifier;
  if (!identifier.startsWith(EMAIL_VERIFICATION_TOKEN_PREFIX)) {
    return null;
  }

  const userId = identifier.slice(EMAIL_VERIFICATION_TOKEN_PREFIX.length);
  const expiresAt = record.expires instanceof Date ? record.expires : new Date(record.expires);

  const deleteCondition = and(
    eq(tables.verificationTokens.identifier, identifier),
    eq(tables.verificationTokens.token, record.token),
  );

  if (expiresAt <= new Date()) {
    await db.delete(tables.verificationTokens).where(deleteCondition);
    return null;
  }

  await db.delete(tables.verificationTokens).where(deleteCondition);

  return { userId };
}
