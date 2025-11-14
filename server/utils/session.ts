import type { Session } from 'next-auth'
import type { ExtendedSession as _ExtendedSession, ServerSessionUser } from '#shared/types/auth'

export function getSessionUser(session: Session | null): ServerSessionUser | null {
  if (!session?.user) {
    return null
  }

  const candidate = session.user as Partial<ServerSessionUser>

  if (!candidate.id || !candidate.username || !candidate.role) {
    return null
  }

  return {
    id: candidate.id,
    username: candidate.username,
    role: candidate.role,
    permissions: candidate.permissions ?? [],
    email: candidate.email ?? null,
    name: candidate.name ?? null,
    image: candidate.image ?? null,
    remember: candidate.remember ?? null,
  }
}

export function isAdmin(session: Session | null): boolean {
  const user = getSessionUser(session)
  if (!user) return false

  return user.role === 'admin'
}
