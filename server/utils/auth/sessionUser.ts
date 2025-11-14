import type { Session } from 'next-auth'

import type { ResolvedSessionUser } from '#shared/types/auth'

export function resolveSessionUser(session: Session | null): ResolvedSessionUser | null {
  if (!session?.user) {
    return null
  }

  const user = session.user as Session['user'] & Pick<ResolvedSessionUser, 'id' | 'username' | 'role' | 'permissions'>

  if (!user.id || !user.username || !user.role) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: user.permissions || [],
  }
}
