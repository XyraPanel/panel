import type { getServerSession } from '#server/utils/session'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import type { resolveSessionUser } from '#server/utils/auth/sessionUser'
import { parseUserAgent } from '#server/utils/user-agent'

type AuthContext = {
  session: Awaited<ReturnType<typeof getServerSession>>
  user: NonNullable<ReturnType<typeof resolveSessionUser>>
}

export default defineEventHandler(async (event) => {
  const path = event.path || event.node.req.url || ''
  if (path.startsWith('/api/auth'))
    return

  const cookies = parseCookies(event)
  const cookieToken = cookies['better-auth.session_token']
  if (!cookieToken) {
    return
  }

  const contextAuth = (event.context as typeof event.context & { auth?: AuthContext }).auth
  if (!contextAuth?.user?.id) {
    return
  }

  const db = useDrizzle()
  
  const dbSession = db
    .select({ sessionToken: tables.sessions.sessionToken })
    .from(tables.sessions)
    .where(eq(tables.sessions.sessionToken, cookieToken))
    .get()

  if (!dbSession?.sessionToken) {
    return
  }

  const userAgent = getHeader(event, 'user-agent') || ''
  const ipAddress = getRequestIP(event) || 'Unknown'
  const now = new Date()
  const deviceInfo = parseUserAgent(userAgent)

  try {
    await db.insert(tables.sessionMetadata).values({
      sessionToken: dbSession.sessionToken,
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
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'
    if (isProduction) {
      console.error('[Session Tracker] Failed to track session metadata')
    } else {
      console.error('[Session Tracker] Failed to track session metadata:', error)
    }
  }
})
