import { createError, parseCookies } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const resolvedUser = resolveSessionUser(session)
  const db = useDrizzle()

  if (!resolvedUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const rows = db.select({
    sessionToken: tables.sessions.sessionToken,
    expires: tables.sessions.expires,
  })
    .from(tables.sessions)
    .where(eq(tables.sessions.userId, resolvedUser.id))
    .all()

  const cookies = parseCookies(event)
  const currentToken = cookies['authjs.session-token']
    ?? cookies['next-auth.session-token']
    ?? cookies['__Secure-next-auth.session-token']

  return {
    data: rows.map((row) => {

      const expiresDate = row.expires instanceof Date
        ? row.expires
        : new Date(row.expires)

      return {
        token: row.sessionToken,
        issuedAt: '',
        expiresAt: expiresDate.toISOString(),
        expiresAtTimestamp: expiresDate.getTime(),
        isCurrent: row.sessionToken === currentToken,
      }
    }),
    currentToken: currentToken ?? null,
  }
})
