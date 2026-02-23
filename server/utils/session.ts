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

export async function getServerSession(event: H3Event): Promise<SessionType | null> {
  const contextAuth = (event.context as { auth?: { session?: SessionType } }).auth;
  if (contextAuth?.session) {
    return contextAuth.session;
  }

  return await auth.api.getSession({
    headers: normalizeHeadersForAuth(event.node.req.headers),
  });
}

export function getSessionUser(
  session: Awaited<ReturnType<typeof getServerSession>> | null,
): ServerSessionUser | null {
  if (!session?.user) {
    return null;
  }

  const candidate = session.user as Partial<ServerSessionUser>;

  if (!candidate.id || !candidate.username || !candidate.role) {
    return null;
  }

  return {
    id: candidate.id,
    username: candidate.username,
    role: candidate.role,
    permissions: candidate.permissions ?? [],
    email: candidate.email ?? null,
    name: candidate.name ?? null,
    image: candidate.image ?? null,
    remember: candidate.remember ?? null,
    passwordResetRequired: candidate.passwordResetRequired ?? false,
  };
}

export function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> | null): boolean {
  const user = getSessionUser(session);
  if (!user) return false;

  return user.role === 'admin';
}
