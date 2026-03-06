import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';
import { requireRouteParam } from '#server/utils/http/params';
import { auth, getAuthHeaders } from '#server/utils/auth';
import { APIError } from 'better-auth/api';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Delete API key',
    description: 'Revokes and deletes a specific API key belonging to the authenticated user.',
    parameters: [
      {
        in: 'path',
        name: 'identifier',
        required: true,
        schema: { type: 'string' },
        description: 'The unique identifier of the API key to delete',
      },
    ],
    responses: {
      200: {
        description: 'API key successfully deleted',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      404: { description: 'API key not found' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE');

  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const identifier = await requireRouteParam(event, 'identifier', 'Missing API key identifier');

  const db = useDrizzle();

  const apiKeyResult = await db
    .select()
    .from(tables.apiKeys)
    .where(and(eq(tables.apiKeys.id, identifier), eq(tables.apiKeys.userId, user.id)))
    .limit(1);

  const apiKey = apiKeyResult[0];

  if (!apiKey) {
    throw createError({
      status: 404,
      message: 'API key not found',
    });
  }

  try {
    await auth.api.deleteApiKey({
      body: { keyId: apiKey.id },
      headers: getAuthHeaders(event),
    });
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Failed to delete API key',
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
