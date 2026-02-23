import type {
  UserSessionSummary,
  AccountSessionsResponse,
  AuthContext,
  AccountSessionRow,
} from '#shared/types/auth';
import { requireAccountUser } from '#server/utils/security';
import { parseUserAgent } from '#server/utils/user-agent';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

export default defineEventHandler(async (event): Promise<AccountSessionsResponse> => {
  const middlewareAuth = (event.context as { auth?: AuthContext }).auth;
  const accountContext = middlewareAuth
    ? { session: middlewareAuth.session, user: middlewareAuth.user }
    : await requireAccountUser(event);

  const { user } = accountContext;

  if (!user?.id) {
    throw createError({ status: 401, statusText: 'Unauthorized' });
  }

  const db = useDrizzle();
  let metadataAvailable = true;
  let rows: AccountSessionRow[];

  try {
    const query = db
      .select({
        sessionToken: tables.sessions.sessionToken,
        expires: tables.sessions.expires,
        metadataIp: tables.sessions.ipAddress,
        metadataUserAgent: tables.sessions.userAgent,
        metadataDevice: tables.sessionMetadata.deviceName,
        metadataBrowser: tables.sessionMetadata.browserName,
        metadataOs: tables.sessionMetadata.osName,
        firstSeenAt: tables.sessionMetadata.firstSeenAt,
        lastSeenAt: tables.sessionMetadata.lastSeenAt,
      })
      .from(tables.sessions)
      .leftJoin(
        tables.sessionMetadata,
        eq(tables.sessionMetadata.sessionToken, tables.sessions.sessionToken),
      )
      .where(eq(tables.sessions.userId, user.id));

    rows = (await query) as AccountSessionRow[];
  } catch (error) {
    if (error instanceof Error && /session_metadata/i.test(error.message ?? '')) {
      metadataAvailable = false;
      rows = (await db
        .select({
          sessionToken: tables.sessions.sessionToken,
          expires: tables.sessions.expires,
          metadataIp: tables.sessions.ipAddress,
          metadataUserAgent: tables.sessions.userAgent,
        })
        .from(tables.sessions)
        .where(eq(tables.sessions.userId, user.id))) as AccountSessionRow[];
    } else {
      throw error;
    }
  }

  const currentToken =
    (middlewareAuth?.session as any)?.session?.token ??
    (accountContext.session as any)?.session?.token ??
    null;

  const currentIp = getRequestIP(event) || null;
  const currentUserAgent = getHeader(event, 'user-agent') || '';
  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = await getRequestFingerprint(event);
  } catch {
    currentFingerprint = null;
  }

  const nowIso = new Date().toISOString();

  if (metadataAvailable && currentToken && currentUserAgent) {
    const currentRow = rows.find((r) => r.sessionToken === currentToken);
    if (currentRow) {
      const parsedInfo = parseUserAgent(currentUserAgent);
      const existingFirstSeen = currentRow.firstSeenAt
        ? currentRow.firstSeenAt instanceof Date
          ? currentRow.firstSeenAt.toISOString()
          : (currentRow.firstSeenAt as string)
        : nowIso;
      await db
        .insert(tables.sessionMetadata)
        .values({
          sessionToken: currentToken,
          ipAddress: currentIp || currentRow.metadataIp || null,
          userAgent: currentUserAgent,
          deviceName: parsedInfo.device || null,
          browserName: parsedInfo.browser || null,
          osName: parsedInfo.os || null,
          firstSeenAt: existingFirstSeen,
          lastSeenAt: nowIso,
        })
        .onConflictDoUpdate({
          target: tables.sessionMetadata.sessionToken,
          set: {
            ipAddress: currentIp || currentRow.metadataIp || null,
            userAgent: currentUserAgent,
            deviceName: parsedInfo.device || null,
            browserName: parsedInfo.browser || null,
            osName: parsedInfo.os || null,
            lastSeenAt: nowIso,
          },
        });
      currentRow.metadataIp = currentIp || currentRow.metadataIp || null;
      currentRow.metadataUserAgent = currentUserAgent;
      currentRow.metadataBrowser = parsedInfo.browser || '';
      currentRow.metadataOs = parsedInfo.os || '';
      currentRow.metadataDevice = parsedInfo.device || '';
      currentRow.firstSeenAt = existingFirstSeen as any;
      currentRow.lastSeenAt = nowIso as any;
    }
  }

  const data: UserSessionSummary[] = rows.map((row) => {
    // Drizzle's mode: 'timestamp' should return a Date object
    // But Better Auth stores expires as seconds (Unix) in the database
    let expiresDate: Date;

    if (row.expires instanceof Date) {
      expiresDate = row.expires;
    } else if (typeof row.expires === 'number') {
      const timestampStr = String(row.expires);

      if (timestampStr.length <= 10) {
        expiresDate = new Date(row.expires * 1000);
      } else {
        expiresDate = new Date(row.expires);
      }
    } else {
      const parsedDate = new Date(row.expires);
      expiresDate = !isNaN(parsedDate.getTime())
        ? parsedDate
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    const year = expiresDate.getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      console.warn(
        `Invalid expires date year: ${year} for token ${row.sessionToken.substring(0, 8)}..., using default`,
      );
      expiresDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    const isCurrent = row.sessionToken === currentToken;

    let ipAddress = row.metadataIp || null;
    let userAgent = row.metadataUserAgent || '';
    let browser = row.metadataBrowser || '';
    let os = row.metadataOs || '';
    let device = row.metadataDevice || '';

    const firstSeenDate =
      row.firstSeenAt instanceof Date
        ? row.firstSeenAt
        : row.firstSeenAt
          ? new Date(row.firstSeenAt)
          : null;

    const lastSeenDate =
      row.lastSeenAt instanceof Date
        ? row.lastSeenAt
        : row.lastSeenAt
          ? new Date(row.lastSeenAt)
          : null;

    if (isCurrent) {
      if (!ipAddress && currentIp) ipAddress = currentIp;
      if (!userAgent && currentUserAgent) userAgent = currentUserAgent;
    }

    const parsedInfo = parseUserAgent(userAgent);
    if (!browser) browser = parsedInfo.browser;
    if (!os) os = parsedInfo.os;
    if (!device) device = parsedInfo.device;

    return {
      token: row.sessionToken,
      issuedAt: new Date(expiresDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: expiresDate.toISOString(),
      expiresAtTimestamp: expiresDate.getTime(),
      isCurrent,
      ipAddress: ipAddress || 'Unknown',
      userAgent: userAgent || 'Unknown',
      browser,
      os,
      device,
      lastSeenAt: lastSeenDate ? lastSeenDate.toISOString() : null,
      firstSeenAt: firstSeenDate ? firstSeenDate.toISOString() : null,
      fingerprint: isCurrent ? currentFingerprint : null,
    };
  });

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'account.sessions.listed',
    targetType: 'user',
    targetId: user.id,
    metadata: { count: data.length },
  });

  const response: AccountSessionsResponse = {
    data,
    currentToken: currentToken ?? null,
  };

  return response;
});
