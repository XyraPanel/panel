import type { getServerSession } from '#server/utils/session';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import type { resolveSessionUser } from '#server/utils/auth/sessionUser';
import { parseUserAgent } from '#server/utils/user-agent';

const TRACK_INTERVAL_MS = 60 * 1000;
const TRACK_MAP_MAX = 5000;
const TRACK_MAP_TTL_MS = 10 * 60 * 1000;
const lastTrackedAt = new Map<string, number>();
const pendingSessionWrites = new Set<string>();

function shouldTrackSession(sessionToken: string, nowTs: number): boolean {
  const last = lastTrackedAt.get(sessionToken);
  if (typeof last === 'number' && nowTs - last < TRACK_INTERVAL_MS) {
    return false;
  }

  lastTrackedAt.set(sessionToken, nowTs);

  if (lastTrackedAt.size > TRACK_MAP_MAX) {
    for (const [token, ts] of lastTrackedAt) {
      if (nowTs - ts > TRACK_MAP_TTL_MS) {
        lastTrackedAt.delete(token);
      }
    }
  }

  return true;
}

type AuthContext = {
  session: Awaited<ReturnType<typeof getServerSession>>;
  user: NonNullable<ReturnType<typeof resolveSessionUser>>;
};

export default defineEventHandler(async (event) => {
  const requestPath = event.path || event.node.req.url || '';
  const path = requestPath.split('?')[0] || requestPath;

  if (path.startsWith('/api/auth')) return;

  if (path.startsWith('/api/wings') || path.startsWith('/api/remote')) return;

  const cookies = parseCookies(event);
  const cookieToken = cookies['better-auth.session_token'];
  if (!cookieToken) {
    return;
  }

  const contextAuth = (event.context as typeof event.context & { auth?: AuthContext }).auth;
  if (!contextAuth?.user?.id) {
    return;
  }

  const db = useDrizzle();

  const nowTs = Date.now();
  if (!shouldTrackSession(cookieToken, nowTs)) {
    return;
  }

  if (pendingSessionWrites.has(cookieToken)) {
    return;
  }
  pendingSessionWrites.add(cookieToken);

  const userAgent = getHeader(event, 'user-agent') || '';
  const ipAddress = getRequestIP(event) || 'Unknown';
  const now = new Date(nowTs);
  const nowIso = now.toISOString();
  const deviceInfo = parseUserAgent(userAgent);

  try {
    const parentSession = await db
      .select({ sessionToken: tables.sessions.sessionToken })
      .from(tables.sessions)
      .where(eq(tables.sessions.sessionToken, cookieToken))
      .limit(1);

    if (parentSession.length === 0) {
      return;
    }

    await db
      .insert(tables.sessionMetadata)
      .values({
        sessionToken: cookieToken,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        ipAddress,
        userAgent,
        deviceName: deviceInfo.device,
        browserName: deviceInfo.browser,
        osName: deviceInfo.os,
      })
      .onConflictDoUpdate({
        target: tables.sessionMetadata.sessionToken,
        set: {
          lastSeenAt: nowIso,
          ipAddress,
          userAgent,
          deviceName: deviceInfo.device,
          browserName: deviceInfo.browser,
          osName: deviceInfo.os,
        },
      });
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.error('[Session Tracker] Failed to track session metadata');
    } else {
      console.error('[Session Tracker] Failed to track session metadata:', error);
    }
  } finally {
    pendingSessionWrites.delete(cookieToken);
  }
});
