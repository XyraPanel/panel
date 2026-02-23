import { createError, getHeader, type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { parseAuthToken, decryptToken } from '#server/utils/wings/encryption';

export async function getNodeIdFromAuth(event: H3Event): Promise<string> {
  const authHeader = getHeader(event, 'authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Missing or invalid Wings authentication token',
    });
  }

  const parsed = parseAuthToken(authHeader);

  if (!parsed) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'The Authorization header provided was not in a valid format.',
    });
  }

  const { tokenId, token } = parsed;

  const db = useDrizzle();
  const [node] = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.tokenIdentifier, tokenId))
    .limit(1);

  if (!node) {
    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: 'You are not authorized to access this resource.',
    });
  }

  const combinedToken = `${tokenId}.${token}`;
  if (
    typeof node.apiToken === 'string' &&
    node.apiToken.includes('.') &&
    constantTimeCompare(combinedToken, node.apiToken)
  ) {
    return node.id;
  }

  try {
    const decryptedToken = decryptToken(node.tokenSecret);

    if (!constantTimeCompare(token, decryptedToken)) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
        message: 'You are not authorized to access this resource.',
      });
    }
  } catch {
    // Compatibility fallback for legacy plain tokenSecret rows.
    if (
      typeof node.tokenSecret === 'string' &&
      node.tokenSecret.length > 0 &&
      constantTimeCompare(token, node.tokenSecret)
    ) {
      return node.id;
    }

    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: 'You are not authorized to access this resource.',
    });
  }

  return node.id;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
