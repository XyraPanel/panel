import { createError, getQuery, parseCookies } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, and, ne } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const includeCurrent = query.includeCurrent === 'true'

  const cookies = parseCookies(event)
  const currentToken = cookies['authjs.session-token']
    ?? cookies['next-auth.session-token']
    ?? cookies['__Secure-next-auth.session-token']

  const db = useDrizzle()

  if (includeCurrent) {
    const result = db.delete(tables.sessions)
      .where(eq(tables.sessions.userId, user.id))
      .run()

    const revoked = typeof result.changes === 'number' ? result.changes : 0

    return {
      revoked,
      currentSessionRevoked: true,
    }
  }

  const result = currentToken
    ? db.delete(tables.sessions)
      .where(and(
        eq(tables.sessions.userId, user.id),
        ne(tables.sessions.sessionToken, currentToken),
      ))
      .run()
    : db.delete(tables.sessions)
      .where(eq(tables.sessions.userId, user.id))
      .run()

  const revoked = typeof result.changes === 'number' ? result.changes : 0

  return {
    revoked,
    currentSessionRevoked: false,
  }
})
