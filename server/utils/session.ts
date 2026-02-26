import type { H3Event } from 'h3';
import type { ServerSessionUser } from '#shared/types/auth';
import { normalizeHeadersForAuth, auth } from '#server/utils/auth';

export async function verifySessionToken(
  token: string,
): Promise<ReturnType<typeof getSessionUser>> {
  const session = await auth.api.getSession({
    headers: normalizeHeadersForAuth({
      authorization: `Bearer ${token}`,
      cookie: token,
    }),
  });
  return getSessionUser(session);
}

type SessionType = Awaited<ReturnType<typeof auth.api.getSession>>;

function isAuthContext(value: unknown): value is { session?: SessionType } {
  return typeof value === 'object' && value !== null && 'session' in value;
}

function isRole(value: unknown): value is ServerSessionUser['role'] {
  return value === 'admin' || value === 'user';
}

export async function getServerSession(event: H3Event): Promise<SessionType | null> {
  const contextAuth = event.context?.auth;
  if (isAuthContext(contextAuth) && contextAuth.session) {
    return contextAuth.session;
  }

  return await auth.api.getSession({
    headers: normalizeHeadersForAuth(event.node.req.headers),
  });
}

export function getSessionUser(
  session: Awaited<ReturnType<typeof getServerSession>> | null,
): ServerSessionUser | null {
  const user = session?.user;
  if (!user || typeof user !== 'object') {
    return null;
  }

  const {
    id,
    username,
    role,
    permissions,
    email,
    name,
    image,
    remember,
    passwordResetRequired,
  } = user as Record<string, unknown>;

  if (typeof id !== 'string' || typeof username !== 'string' || !isRole(role)) {
    return null;
  }

  return {
    id,
    username,
    role,
    permissions: Array.isArray(permissions)
      ? permissions.filter((p): p is string => typeof p === 'string')
      : [],
    email: typeof email === 'string' ? email : null,
    name: typeof name === 'string' ? name : null,
    image: typeof image === 'string' || image === null ? (image ?? null) : null,
    remember: typeof remember === 'boolean' ? remember : null,
    passwordResetRequired: typeof passwordResetRequired === 'boolean' ? passwordResetRequired : false,
  };
}

export function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> | null): boolean {
  const user = getSessionUser(session);
  if (!user) return false;

  return user.role === 'admin';
}
