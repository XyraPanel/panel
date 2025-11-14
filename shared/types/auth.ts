export type Role = 'admin' | 'user'

export interface SanitizedUser {
  id: string
  username: string
  email: string
  role: Role
}

export interface SessionData {
  user: SanitizedUser
  issuedAt: string
  expiresAt: string
}

export interface SessionUser {
  id?: string | null
  username?: string | null
  email?: string | null
  role?: Role | null
  name?: string | null
  image?: string | null
  permissions?: string[]
  remember?: boolean | null
}

export interface AuthenticatedSession {
  user?: SessionUser | null
}

export interface ResolvedSessionUser extends SessionUser {
  id: string
  username: string
  role: Role
  permissions: string[]
}

export interface ServerSessionUser extends SessionUser {
  id: string
  username: string
  role: Role
  permissions: string[]
}

export interface ExtendedSession {
  user: ServerSessionUser | null
}

export interface UserSessionSummary {
  token: string
  issuedAt: string
  expiresAt: string
  expiresAtTimestamp: number
}

export interface SessionMetadata {
  sessionToken: string | null
  remember: boolean
  refreshedAt: string
}

export interface UpdateUserInput {
  username?: string
  email?: string
  role?: Role
}

export interface UpdatePasswordOptions {
  preserveToken?: string
}

export interface UpdatePasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword?: string
}

export interface AccountProfileResponse {
  data: SanitizedUser
}

export interface AccountSessionsResponse {
  data: UserSessionSummary[]
  currentToken: string | null
}
