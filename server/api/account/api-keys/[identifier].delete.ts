import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';
import { requireRouteParam } from '#server/utils/http/params';
import { getAuth, normalizeHeadersForAuth } from '#server/utils/auth';
import { APIError } from 'better-auth/api';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE');

  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const identifier = await requireRouteParam(event, 'identifier', 'Missing API key identifier');

  const db = useDrizzle();
  const auth = getAuth();

  const apiKeyResult = await db
    .select()
    .from(tables.apiKeys)
    .where(and(eq(tables.apiKeys.id, identifier), eq(tables.apiKeys.userId, user.id)))
    .limit(1);

  const apiKey = apiKeyResult[0];

  if (!apiKey) {
    throw createError({
      status: 404,
      statusText: 'Not Found',
      message: 'API key not found',
    });
  }

  try {
    await auth.api.deleteApiKey({
      body: { keyId: apiKey.id },
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
    actor: user.id,
    actorType: 'user',
    action: 'account.api_key.delete',
    targetType: 'user',
    targetId: identifier,
    metadata: {
      identifier,
    },
  });

  return { success: true };
});
