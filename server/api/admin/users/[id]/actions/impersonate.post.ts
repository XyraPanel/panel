import { APIError } from 'better-auth/api';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { auth, getAuthHeaders } from '#server/utils/auth';

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

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Users'],
    summary: 'Impersonate a user',
    description:
      'Sensitive action: starts an impersonation session as the target user, setting an impersonation session cookie on the response. Cannot target the calling admin or a banned user. The raw session token is never included in the JSON response. Requires an admin session with the users:write ACL permission.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID to impersonate',
      },
    ],
    responses: {
      '200': {
        description: 'Impersonation session started; session cookie set on the response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'User ID is required, cannot impersonate yourself, or cannot impersonate a banned user',
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing users:write ACL permission' },
      '404': { description: 'User not found' },
      '500': { description: 'Failed to impersonate user' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, message: 'User ID is required' });
  }

  if (userId === session.user.id) {
    throw createError({
      status: 400,
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
    throw createError({ status: 404, message: 'User not found' });
  }

  if (user.banned) {
    throw createError({
      status: 400,
      message: 'Cannot impersonate a banned user',
    });
  }

  try {
    const headers = getAuthHeaders(event);
    const impersonateResponse = await auth.api.impersonateUser({
      body: { userId },
      headers,
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

    // Deliberately not returning better-auth's response payload here — it includes
    // the impersonation session token, and the cookie set above already carries the
    // session. Echoing it back in the JSON body would needlessly expose a stealable
    // credential to anything with response access (logs, browser extensions, etc).
    return {
      data: {
        success: true,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Failed to impersonate user',
      });
    }
    debugError('[Admin User Impersonate Action] Failed for user:', userId, error);
    throw createError({
      statusCode: 500,
      message: 'Failed to impersonate user',
    });
  }
});
