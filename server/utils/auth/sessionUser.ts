import { createError } from 'h3'
import type { ResolvedSessionUser } from '#shared/types/auth'
import type { getServerSession } from '#server/utils/session'
import { getSessionUser } from '#server/utils/session'

export function resolveSessionUser(
  session: Awaited<ReturnType<typeof getServerSession>> | null
): ResolvedSessionUser | null {
  return getSessionUser(session) as ResolvedSessionUser | null
}

export function requireSessionUser(
  session: Awaited<ReturnType<typeof getServerSession>> | null
): ResolvedSessionUser {
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Authentication required',
    })
  }

  const user = resolveSessionUser(session)
  
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid session user',
    })
  }
  
  return user
}

