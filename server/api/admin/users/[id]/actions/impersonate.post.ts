import { appendResponseHeader, splitCookiesString } from 'h3';
import { APIError } from 'better-auth/api';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { auth, normalizeHeadersForAuth } from '#server/utils/auth';

function extractSetCookieStrings(headers?: Headers | null): string[] {
  if (!headers) return [];

  const cookies: string[] = [];
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    cookies.push(...withGetSetCookie.getSetCookie.call(headers));
  }

  if (!cookies.length) {
    const withRaw = headers as Headers & { raw?: () => Record<string, string[] | undefined> };
    if (typeof withRaw.raw === 'function') {
      const rawCookies = withRaw.raw.call(headers)?.['set-cookie'];
      if (Array.isArray(rawCookies)) cookies.push(...rawCookies);
    }
  }

  if (!cookies.length) {
    const singleHeader = headers.get('set-cookie');
    if (singleHeader) cookies.push(...splitCookiesString(singleHeader));
  }

  return cookies;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractHeaders(value: unknown): Headers | undefined {
  if (!isRecord(value)) return undefined;

  const candidate = value.headers;
  return candidate instanceof Headers ? candidate : undefined;
}

function extractResponsePayload(value: unknown): unknown {
  if (!isRecord(value)) return value;

  return 'response' in value ? value.response : value;
}

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'User ID is required' });
  }

  if (userId === session.user.id) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Cannot impersonate yourself',
    });
  }

  const db = useDrizzle();

  const userResult = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      banned: tables.users.banned,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'User not found' });
  }

  if (user.banned) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Cannot impersonate a banned user',
    });
  }

  try {
    const impersonateResponse = await auth.api.impersonateUser({
      body: { userId },
      headers: normalizeHeadersForAuth(event.node.req.headers),
      returnHeaders: true,
    });

    const responseHeaders = extractHeaders(impersonateResponse);
    const setCookies = extractSetCookieStrings(responseHeaders);
    for (const cookieString of setCookies) {
      appendResponseHeader(event, 'set-cookie', cookieString);
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.impersonate',
      targetType: 'user',
      targetId: userId,
      metadata: {
        username: user.username,
      },
    });

    const responsePayload = extractResponsePayload(impersonateResponse);
    const responseData = isRecord(responsePayload) ? responsePayload : {};

    return {
      data: {
        ...responseData,
        success: true,
      },
    };
  } catch (error) {
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to impersonate user',
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to impersonate user';
    throw createError({
      statusCode: 500,
      statusMessage: message,
    });
  }
});
