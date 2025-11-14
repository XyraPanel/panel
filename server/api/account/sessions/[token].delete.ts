import { assertMethod, createError, getValidatedRouterParams, parseCookies } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE')

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { token: targetToken } = await getValidatedRouterParams(event, (params) => {
    const tokenParam = (params as Record<string, unknown>).token
    if (typeof tokenParam !== 'string' || tokenParam.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Missing session token' })
    }

    return { token: tokenParam }
  })

  const db = useDrizzle()
  const cookies = parseCookies(event)
  const currentToken = cookies['authjs.session-token']
    ?? cookies['next-auth.session-token']
    ?? cookies['__Secure-next-auth.session-token']

  const result = db.delete(tables.sessions)
    .where(and(
      eq(tables.sessions.userId, user.id),
      eq(tables.sessions.sessionToken, targetToken),
    ))
    .run()

  const removed = typeof result.changes === 'number' ? result.changes > 0 : false

  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  return { revoked: true, currentSessionRevoked: currentToken === targetToken }
})
