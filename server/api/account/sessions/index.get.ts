import { createError, parseCookies } from 'h3'
import { auth, normalizeHeadersForAuth } from '~~/server/utils/auth'
import type { UserSessionSummary, AccountSessionsResponse, AuthContext } from '#shared/types/auth'
import { parseUserAgent } from '~~/server/utils/user-agent'

export default defineEventHandler(async (event): Promise<AccountSessionsResponse> => {
  const middlewareAuth = (event.context as { auth?: AuthContext }).auth
  
  let session: AuthContext | null
  if (middlewareAuth?.user?.id) {
    session = middlewareAuth
  } else {
    const betterAuthSession = await auth.api.getSession({
      headers: normalizeHeadersForAuth(event.node.req.headers),
    })
    session = betterAuthSession as unknown as AuthContext | null
  }

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDrizzle()
  let metadataAvailable = true
  let rows: AccountSessionRow[]

  try {
    rows = db.select({
      sessionToken: tables.sessions.sessionToken,
      expires: tables.sessions.expires,
      metadataIp: tables.sessionMetadata.ipAddress,
      metadataUserAgent: tables.sessionMetadata.userAgent,
      metadataDevice: tables.sessionMetadata.deviceName,
      metadataBrowser: tables.sessionMetadata.browserName,
      metadataOs: tables.sessionMetadata.osName,
      firstSeenAt: tables.sessionMetadata.firstSeenAt,
      lastSeenAt: tables.sessionMetadata.lastSeenAt,
    })
      .from(tables.sessions)
      .leftJoin(tables.sessionMetadata, eq(tables.sessionMetadata.sessionToken, tables.sessions.sessionToken))
      .where(eq(tables.sessions.userId, session.user.id))
      .all()
  }
  catch (error) {
    if (error instanceof Error && /session_metadata/i.test(error.message ?? '')) {
      metadataAvailable = false
      rows = db.select({
        sessionToken: tables.sessions.sessionToken,
        expires: tables.sessions.expires,
      })
        .from(tables.sessions)
        .where(eq(tables.sessions.userId, session.user.id))
        .all()
    }
    else {
      throw error
    }
  }

  const cookies = parseCookies(event)
  const currentToken = cookies['better-auth.session_token']

  const currentIp = getRequestIP(event) || null
  const currentUserAgent = getHeader(event, 'user-agent') || ''
  let currentFingerprint: string | null = null
  try {
    currentFingerprint = await getRequestFingerprint(event)
  }
  catch {
    currentFingerprint = null
  }

  const metadataUpserts: SessionMetadataUpsertInput[] = []

  const data: UserSessionSummary[] = rows.map((row) => {
    // Drizzle's mode: 'timestamp' should return a Date object
    // But Better Auth stores expires as seconds (Unix) in the database
    let expiresDate: Date
    
    if (row.expires instanceof Date) {
      expiresDate = row.expires
    }
    else if (typeof row.expires === 'number') {
      const timestampStr = String(row.expires)
      
      if (timestampStr.length <= 10) {
        expiresDate = new Date(row.expires * 1000)
      }
      else {
        expiresDate = new Date(row.expires)
      }
    }
    else {
      const parsedDate = new Date(row.expires)
      expiresDate = !isNaN(parsedDate.getTime()) ? parsedDate : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
    
    const year = expiresDate.getFullYear()
    if (isNaN(year) || year < 2000 || year > 2100) {
      console.warn(`Invalid expires date year: ${year} for token ${row.sessionToken.substring(0, 8)}..., using default`)
      expiresDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }

    const isCurrent = row.sessionToken === currentToken

    let ipAddress = row.metadataIp || null
    let userAgent = row.metadataUserAgent || ''
    let browser = row.metadataBrowser || ''
    let os = row.metadataOs || ''
    let device = row.metadataDevice || ''

    const firstSeenDate = row.firstSeenAt instanceof Date
      ? row.firstSeenAt
      : row.firstSeenAt
        ? new Date(row.firstSeenAt)
        : null

    const lastSeenDate = row.lastSeenAt instanceof Date
      ? row.lastSeenAt
      : row.lastSeenAt
        ? new Date(row.lastSeenAt)
        : null

    if (isCurrent) {
      if (!ipAddress && currentIp)
        ipAddress = currentIp
      if (!userAgent && currentUserAgent)
        userAgent = currentUserAgent
    }

    const parsedInfo = parseUserAgent(userAgent)
    if (!browser)
      browser = parsedInfo.browser
    if (!os)
      os = parsedInfo.os
    if (!device)
      device = parsedInfo.device

    if (
      isCurrent &&
      metadataAvailable &&
      userAgent &&
      (
        !row.metadataUserAgent ||
        !row.metadataIp ||
        !row.metadataBrowser ||
        !row.metadataOs ||
        !row.metadataDevice
      )
    ) {
      metadataUpserts.push({
        sessionToken: row.sessionToken,
        ipAddress,
        userAgent,
        deviceName: device || null,
        browserName: browser || null,
        osName: os || null,
        firstSeenAt: firstSeenDate,
      })
    }

    return {
      token: row.sessionToken,
      issuedAt: new Date(expiresDate.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString(),
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
    }
  })

  if (metadataAvailable && metadataUpserts.length) {
    const now = new Date()
    await Promise.all(metadataUpserts.map((entry) =>
      db.insert(tables.sessionMetadata).values({
        sessionToken: entry.sessionToken,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        deviceName: entry.deviceName,
        browserName: entry.browserName,
        osName: entry.osName,
        firstSeenAt: entry.firstSeenAt ?? now,
        lastSeenAt: now,
      }).onConflictDoUpdate({
        target: tables.sessionMetadata.sessionToken,
        set: {
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          deviceName: entry.deviceName,
          browserName: entry.browserName,
          osName: entry.osName,
          lastSeenAt: now,
        },
      })
    ))
  }

  const response: AccountSessionsResponse = {
    data,
    currentToken: currentToken ?? null,
  }

  return response
})
