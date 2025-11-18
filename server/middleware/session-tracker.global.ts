import type { Session } from 'next-auth'

import { getServerSession } from '#auth'
import { parseCookies, getRequestIP, getHeader } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

type AuthContext = {
  session: Session
  user: NonNullable<ReturnType<typeof resolveSessionUser>>
}

function parseUserAgent(userAgent: string | undefined | null) {
  const ua = userAgent || ''

  let browser = 'Unknown'
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Edg')) browser = 'Edge'
  else if (ua.includes('Opera')) browser = 'Opera'

  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  let device = 'Desktop'
  if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobile'
  else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet'

  return { browser, os, device }
}

export default defineEventHandler(async (event) => {
  const path = event.path || event.node.req.url || ''
  if (path.startsWith('/api/auth'))
    return

  const contextAuth = (event.context as { auth?: AuthContext }).auth
  const session = contextAuth?.session ?? await getServerSession(event)
  const resolvedUser = contextAuth?.user ?? resolveSessionUser(session)

  if (!resolvedUser?.id) {
    return
  }

  const cookies = parseCookies(event)
  const token = cookies['authjs.session-token']
    ?? cookies['next-auth.session-token']
    ?? cookies['__Secure-next-auth.session-token']

  if (!token) {
    return
  }

  const db = useDrizzle()
  const userAgent = getHeader(event, 'user-agent') || ''
  const ipAddress = getRequestIP(event) || 'Unknown'
  const now = new Date()
  const deviceInfo = parseUserAgent(userAgent)

  const hasSession = db
    .select({ token: tables.sessions.sessionToken })
    .from(tables.sessions)
    .where(eq(tables.sessions.sessionToken, token))
    .get()

  if (!hasSession) {
    return
  }

  await db.insert(tables.sessionMetadata).values({
    sessionToken: token,
    firstSeenAt: now,
    lastSeenAt: now,
    ipAddress,
    userAgent,
    deviceName: deviceInfo.device,
    browserName: deviceInfo.browser,
    osName: deviceInfo.os,
  }).onConflictDoUpdate({
    target: tables.sessionMetadata.sessionToken,
    set: {
      lastSeenAt: now,
      ipAddress,
      userAgent,
      deviceName: deviceInfo.device,
      browserName: deviceInfo.browser,
      osName: deviceInfo.os,
    },
  })
})
