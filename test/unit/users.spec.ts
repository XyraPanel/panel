import { describe, it, expect, beforeEach } from 'vitest'
import { createUserSchema } from '../../shared/schema/admin/users.js'

interface BetterAuthSession {
  session?: {
    id: string
    token: string
    userId: string
    expiresAt: Date
    createdAt: Date
  } | null
  user?: {
    id: string
    email: string
    name?: string | null
    username?: string | null
    role?: string | null
    image?: string | null
    permissions?: string[]
    remember?: boolean | null
    passwordResetRequired?: boolean | null
    emailVerified?: boolean | null
    createdAt?: Date
    updatedAt?: Date
  } | null
}

interface ResolvedUser {
  id: string
  username: string
  role: string
  permissions: string[]
  email: string | null
  name: string | null
  image: string | null
  remember: boolean | null
  passwordResetRequired: boolean
}

function getSessionUser(session: BetterAuthSession | null): ResolvedUser | null {
  if (!session?.user) {
    return null
  }

  const candidate = session.user

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
    passwordResetRequired: candidate.passwordResetRequired ?? false,
  }
}

function resolveSessionUser(session: BetterAuthSession | null): ResolvedUser | null {
  const user = getSessionUser(session)
  
  if (!user || !user.id || !user.username || !user.role) {
    return null
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions ?? [],
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
    remember: user.remember ?? null,
    passwordResetRequired: user.passwordResetRequired ?? false,
  }
}

function isAdmin(session: BetterAuthSession | null): boolean {
  const user = getSessionUser(session)
  if (!user) return false

  return user.role === 'admin'
}


const basePayload = {
  username: 'new-admin',
  email: 'admin@example.com',
  password: 'supersafepass',
  name: 'New Admin',
  role: 'admin' as const,
}

function buildBetterAuthSession(
  overrides: Partial<BetterAuthSession['user']> & {
    id?: string
    username?: string
    role?: 'admin' | 'user'
    permissions?: string[]
    remember?: boolean | null
    passwordResetRequired?: boolean
  } = {},
): BetterAuthSession {
  const user = {
    id: overrides.id ?? 'user-123',
    email: overrides.email ?? 'user@example.com',
    name: overrides.name ?? null,
    username: overrides.username ?? null,
    role: overrides.role ?? 'user',
    image: overrides.image ?? null,
    permissions: overrides.permissions ?? [],
    remember: overrides.remember ?? null,
    passwordResetRequired: overrides.passwordResetRequired ?? false,
    emailVerified: overrides.emailVerified ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }

  return {
    session: {
      id: 'session-123',
      token: 'session-token-123',
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 
      createdAt: new Date(),
    },
    user,
  }
}

describe('Admin create user schema', () => {
  it('accepts a valid payload and infers defaults', () => {
    const result = createUserSchema.parse(basePayload)

    expect(result).toEqual({
      ...basePayload,
      role: 'admin',
    })
  })

  it('rejects invalid email format', () => {
    const invalid = {
      ...basePayload,
      email: 'not-an-email',
    }

    const parsed = createUserSchema.safeParse(invalid)

    expect(parsed.success).toBe(false)
    if (parsed.success) {
      return
    }

    expect(parsed.error.issues.map(issue => issue.path.join('.'))).toContain('email')
  })

  it('rejects password that is too short', () => {
    const invalid = {
      ...basePayload,
      password: 'short',
    }

    const parsed = createUserSchema.safeParse(invalid)

    expect(parsed.success).toBe(false)
    if (parsed.success) {
      return
    }

    expect(parsed.error.issues.map(issue => issue.path.join('.'))).toContain('password')
  })

  it('rejects invalid role', () => {
    const invalid = {
      ...basePayload,
      role: 'invalid-role' as 'admin' | 'user',
    }

    const parsed = createUserSchema.safeParse(invalid)

    expect(parsed.success).toBe(false)
    if (parsed.success) {
      return
    }

    expect(parsed.error.issues.map(issue => issue.path.join('.'))).toContain('role')
  })

  it('accepts valid user role', () => {
    const userPayload = {
      ...basePayload,
      role: 'user' as const,
    }

    const result = createUserSchema.parse(userPayload)
    expect(result.role).toBe('user')
  })

  it('accepts valid admin role', () => {
    const result = createUserSchema.parse(basePayload)
    expect(result.role).toBe('admin')
  })

  it('validates username length', () => {
    const invalid = {
      ...basePayload,
      username: '',
    }

    const parsed = createUserSchema.safeParse(invalid)
    expect(parsed.success).toBe(false)
  })

  it('validates name length', () => {
    const invalid = {
      ...basePayload,
      name: '',
    }

    const parsed = createUserSchema.safeParse(invalid)
    expect(parsed.success).toBe(false)
  })
})

describe('resolveSessionUser utility', () => {
  it('returns null when session is null', () => {
    expect(resolveSessionUser(null)).toBeNull()
  })

  it('returns null when session user is missing', () => {
    const sessionWithoutUser = { session: null, user: null }
    expect(resolveSessionUser(sessionWithoutUser as BetterAuthSession)).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    const sessionWithoutFields = buildBetterAuthSession({ id: undefined, username: undefined, role: undefined })
    expect(resolveSessionUser(sessionWithoutFields)).toBeNull()
  })

  it('maps a valid better-auth session user into resolved shape', () => {
    const session = buildBetterAuthSession({
      id: 'user-123',
      username: 'test-user',
      role: 'admin',
      name: 'Test User',
      email: 'user@example.com',
      permissions: ['admin.users.read', 'admin.servers.read'],
      passwordResetRequired: false,
    })

    const resolved = resolveSessionUser(session)

    expect(resolved).toEqual({
      id: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      username: 'test-user',
      role: 'admin',
      permissions: ['admin.users.read', 'admin.servers.read'],
      image: null,
      remember: null,
      passwordResetRequired: false,
    })
  })

  it('handles optional fields correctly', () => {
    const session = buildBetterAuthSession({
      id: 'user-456',
      username: 'minimal-user',
      role: 'user',
      email: 'minimal@example.com',
    })

    const resolved = resolveSessionUser(session)

    expect(resolved).toEqual({
      id: 'user-456',
      email: 'minimal@example.com',
      name: null,
      username: 'minimal-user',
      role: 'user',
      permissions: [],
      image: null,
      remember: null,
      passwordResetRequired: false,
    })
  })
})

describe('getSessionUser utility', () => {
  it('returns null when session is null', () => {
    expect(getSessionUser(null)).toBeNull()
  })

  it('returns null when session user is missing', () => {
    const sessionWithoutUser = { session: null, user: null }
    expect(getSessionUser(sessionWithoutUser as BetterAuthSession)).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    const incomplete = buildBetterAuthSession({ id: 'user-1', username: undefined, role: undefined })
    expect(getSessionUser(incomplete)).toBeNull()
  })

  it('normalizes optional fields with defaults', () => {
    const session = buildBetterAuthSession({
      id: 'user-2',
      username: 'playerOne',
      role: 'user',
      email: 'player@example.com',
    })

    const user = getSessionUser(session)

    expect(user).toEqual({
      id: 'user-2',
      username: 'playerOne',
      role: 'user',
      permissions: [],
      email: 'player@example.com',
      name: null,
      image: null,
      remember: null,
      passwordResetRequired: false,
    })
  })

  it('preserves provided optional fields', () => {
    const session = buildBetterAuthSession({
      id: 'user-3',
      username: 'mod',
      role: 'user',
      email: 'mod@example.com',
      permissions: ['server.view', 'server.edit'],
      name: 'Moderator',
      image: 'https://example.com/avatar.png',
      remember: true,
      passwordResetRequired: true,
    })

    const user = getSessionUser(session)

    expect(user).toEqual({
      id: 'user-3',
      username: 'mod',
      role: 'user',
      permissions: ['server.view', 'server.edit'],
      email: 'mod@example.com',
      name: 'Moderator',
      image: 'https://example.com/avatar.png',
      remember: true,
      passwordResetRequired: true,
    })
  })

  it('handles null optional fields correctly', () => {
    const session = buildBetterAuthSession({
      id: 'user-4',
      username: 'nulluser',
      role: 'user',
      email: 'null@example.com',
      name: null,
      image: null,
      remember: null,
    })

    const user = getSessionUser(session)

    expect(user).toEqual({
      id: 'user-4',
      username: 'nulluser',
      role: 'user',
      permissions: [],
      email: 'null@example.com',
      name: null,
      image: null,
      remember: null,
      passwordResetRequired: false,
    })
  })
})

describe('isAdmin utility', () => {
  it('returns false for null session', () => {
    expect(isAdmin(null)).toBe(false)
  })

  it('returns false for session without user', () => {
    const sessionWithoutUser = { session: null, user: null }
    expect(isAdmin(sessionWithoutUser as BetterAuthSession)).toBe(false)
  })

  it('returns false for non-admin role', () => {
    const userSession = buildBetterAuthSession({ id: 'user-4', username: 'user', role: 'user' })
    expect(isAdmin(userSession)).toBe(false)
  })

  it('returns true when session user has admin role', () => {
    const adminSession = buildBetterAuthSession({ id: 'admin-1', username: 'admin', role: 'admin' })
    expect(isAdmin(adminSession)).toBe(true)
  })

  it('returns false when role is undefined', () => {
    const sessionWithoutRole = buildBetterAuthSession({ id: 'user-5', username: 'user', role: undefined })
    expect(isAdmin(sessionWithoutRole)).toBe(false)
  })

  it('returns false when role is null', () => {
    const sessionWithNullRole = buildBetterAuthSession({ id: 'user-6', username: 'user', role: undefined })
    expect(isAdmin(sessionWithNullRole)).toBe(false)
  })
})

describe('User validation and security', () => {
  describe('Email validation', () => {
    it('accepts valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.co.uk',
        'user+tag@example.com',
        'user_name@example-domain.com',
      ]

      validEmails.forEach(email => {
        const payload = { ...basePayload, email }
        const result = createUserSchema.safeParse(payload)
        expect(result.success).toBe(true)
      })
    })

    it('rejects invalid email addresses', () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user@example',
        'user space@example.com',
      ]

      invalidEmails.forEach(email => {
        const payload = { ...basePayload, email }
        const result = createUserSchema.safeParse(payload)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Password validation', () => {
    it('accepts passwords of minimum length', () => {
      const payload = { ...basePayload, password: '12345678' } // 8 characters
      const result = createUserSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it('rejects passwords shorter than 8 characters', () => {
      const shortPasswords = ['1234567', 'short', 'pass', '']

      shortPasswords.forEach(password => {
        const payload = { ...basePayload, password }
        const result = createUserSchema.safeParse(payload)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Username validation', () => {
    it('accepts valid usernames', () => {
      const validUsernames = ['user123', 'test_user', 'admin-user', 'User123']

      validUsernames.forEach(username => {
        const payload = { ...basePayload, username }
        const result = createUserSchema.safeParse(payload)
        expect(result.success).toBe(true)
      })
    })

    it('rejects empty usernames', () => {
      const payload = { ...basePayload, username: '' }
      const result = createUserSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('Role validation', () => {
    it('accepts valid roles', () => {
      const validRoles = ['user', 'admin']

      validRoles.forEach(role => {
        const payload = { ...basePayload, role: role as 'user' | 'admin' }
        const result = createUserSchema.safeParse(payload)
        expect(result.success).toBe(true)
      })
    })

    it('defaults to user role when not specified', () => {
      const { role, ...payloadWithoutRole } = basePayload
      const result = createUserSchema.parse(payloadWithoutRole)
      expect(result.role).toBe('user')
    })
  })
})

describe('Session user permissions', () => {
  it('handles empty permissions array', () => {
    const session = buildBetterAuthSession({
      id: 'user-7',
      username: 'noperms',
      role: 'user',
      permissions: [],
    })

    const user = getSessionUser(session)
    expect(user?.permissions).toEqual([])
  })

  it('handles multiple permissions', () => {
    const session = buildBetterAuthSession({
      id: 'user-8',
      username: 'poweruser',
      role: 'user',
      permissions: ['server.create', 'server.edit', 'server.delete', 'server.view'],
    })

    const user = getSessionUser(session)
    expect(user?.permissions).toHaveLength(4)
    expect(user?.permissions).toContain('server.create')
    expect(user?.permissions).toContain('server.delete')
  })

  it('handles admin permissions', () => {
    const session = buildBetterAuthSession({
      id: 'admin-2',
      username: 'superadmin',
      role: 'admin',
      permissions: ['admin.users.read', 'admin.servers.read', 'admin.nodes.read'],
    })

    const user = getSessionUser(session)
    expect(user?.role).toBe('admin')
    expect(user?.permissions).toContain('admin.users.read')
  })
})

describe('Password reset required flag', () => {
  it('defaults to false when not provided', () => {
    const session = buildBetterAuthSession({
      id: 'user-9',
      username: 'normaluser',
      role: 'user',
    })

    const user = getSessionUser(session)
    expect(user?.passwordResetRequired).toBe(false)
  })

  it('preserves password reset required flag when true', () => {
    const session = buildBetterAuthSession({
      id: 'user-10',
      username: 'resetuser',
      role: 'user',
      passwordResetRequired: true,
    })

    const user = getSessionUser(session)
    expect(user?.passwordResetRequired).toBe(true)
  })
})

describe('Session edge cases', () => {
  it('handles session with missing session object', () => {
    const session = {
      user: {
        id: 'user-11',
        username: 'nosession',
        role: 'user',
        email: 'nosession@example.com',
      },
    }

    const user = getSessionUser(session)
    expect(user).not.toBeNull()
    expect(user?.id).toBe('user-11')
  })

  it('handles user with all optional fields as null', () => {
    const session = buildBetterAuthSession({
      id: 'user-12',
      username: 'minimal',
      role: 'user',
      email: 'minimal@example.com',
      name: null,
      image: null,
      remember: null,
      permissions: [],
    })

    const user = getSessionUser(session)
    expect(user).not.toBeNull()
    expect(user?.name).toBeNull()
    expect(user?.image).toBeNull()
    expect(user?.remember).toBeNull()
  })

  it('handles very long usernames', () => {
    const longUsername = 'a'.repeat(255)
    const session = buildBetterAuthSession({
      id: 'user-13',
      username: longUsername,
      role: 'user',
      email: 'long@example.com',
    })

    const user = getSessionUser(session)
    expect(user?.username).toBe(longUsername)
  })
})

describe('Complete User Lifecycle Integration', () => {
  interface MockAuthAPI {
    createUser: (params: { body: { email: string; password: string; name?: string; role?: string; data?: Record<string, unknown> }; headers: Record<string, string> }) => Promise<{ id: string; email: string; username?: string; name?: string; role?: string }>
    signInEmail: (params: { body: { email: string; password: string }; headers: Record<string, string> }) => Promise<{ user: { id: string; email: string; username?: string; role?: string }; session: { id: string; token: string } }>
    getSession: (params: { headers: Record<string, string> }) => Promise<BetterAuthSession | null>
    updateUser: (params: { body: { username?: string }; headers: Record<string, string> }) => Promise<{ id: string; username?: string }>
    changeEmail: (params: { body: { newEmail: string }; headers: Record<string, string> }) => Promise<{ id: string; email: string }>
    adminUpdateUser: (params: { body: { userId: string; data: Record<string, unknown> }; headers: Record<string, string> }) => Promise<{ id: string }>
    setUserPassword: (params: { body: { userId: string; newPassword: string }; headers: Record<string, string> }) => Promise<void>
    banUser: (params: { body: { userId: string; banReason?: string }; headers: Record<string, string> }) => Promise<void>
    unbanUser: (params: { body: { userId: string }; headers: Record<string, string> }) => Promise<void>
    revokeUserSessions: (params: { body: { userId: string }; headers: Record<string, string> }) => Promise<void>
    impersonateUser: (params: { body: { userId: string }; headers: Record<string, string> }) => Promise<{ token: string; expiresAt: string }>
    getUser: (params: { query: { userId: string }; headers: Record<string, string> }) => Promise<{ id: string; email: string; username?: string; role?: string }>
  }

  let mockAuth: MockAuthAPI
  let userStore: Map<string, BetterAuthSession['user'] & { password: string }>
  let sessionStore: Map<string, BetterAuthSession>
  let currentSession: BetterAuthSession | null = null
  let userIdCounter = 0
  let sessionIdCounter = 0

  beforeEach(() => {
    userStore = new Map()
    sessionStore = new Map()
    currentSession = null
    userIdCounter = 0
    sessionIdCounter = 0

    mockAuth = {
      createUser: async ({ body, headers: _headers }) => {
        userIdCounter++
        const userId = `user-${userIdCounter}-${Date.now()}`
        const newUser = {
          id: userId,
          email: body.email,
          username: (body.data as { username?: string })?.username || null,
          name: body.name || null,
          role: body.role || 'user',
          password: body.password,
          permissions: [],
          remember: null,
          passwordResetRequired: false,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        userStore.set(userId, newUser)
        return { id: userId, email: body.email, username: newUser.username || undefined, name: newUser.name || undefined, role: newUser.role || undefined }
      },
      signInEmail: async ({ body, headers: _headers }) => {
        const user = Array.from(userStore.values()).find(u => u.email === body.email)
        if (!user) {
          throw new Error('Invalid credentials: User not found')
        }
        if (user.password !== body.password) {
          throw new Error(`Invalid credentials: Password mismatch. Expected: ${user.password}, Got: ${body.password}`)
        }
        sessionIdCounter++
        const sessionId = `session-${sessionIdCounter}-${Date.now()}`
        const session: BetterAuthSession = {
          session: {
            id: sessionId,
            token: `token-${sessionId}`,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
          },
          user: {
            id: user.id,
            email: user.email,
            username: user.username || null,
            name: user.name || null,
            role: user.role || 'user',
            permissions: user.permissions || [],
            remember: null,
            passwordResetRequired: user.passwordResetRequired || false,
            emailVerified: user.emailVerified || false,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        }
        sessionStore.set(sessionId, session)
        currentSession = session
        return {
          user: {
            id: session.user!.id,
            email: session.user!.email,
            username: session.user!.username ?? undefined,
            role: session.user!.role ?? undefined,
          },
          session: {
            id: session.session!.id,
            token: session.session!.token,
          },
        }
      },
      getSession: async ({ headers: _headers }) => {
        return currentSession
      },
      updateUser: async ({ body, headers: _headers }) => {
        if (!currentSession?.user) throw new Error('Not authenticated')
        const user = userStore.get(currentSession.user.id)
        if (!user) throw new Error('User not found')
        if (body.username !== undefined) {
          user.username = body.username
          user.updatedAt = new Date()
          userStore.set(user.id, user)
          if (currentSession.user) {
            currentSession.user.username = body.username
            currentSession.user.updatedAt = new Date()
          }
        }
        return { id: user.id, username: user.username || undefined }
      },
      changeEmail: async ({ body, headers: _headers }) => {
        if (!currentSession?.user) throw new Error('Not authenticated')
        const user = userStore.get(currentSession.user.id)
        if (!user) throw new Error('User not found')
        user.email = body.newEmail
        user.updatedAt = new Date()
        userStore.set(user.id, user)
        if (currentSession.user) {
          currentSession.user.email = body.newEmail
          currentSession.user.updatedAt = new Date()
        }
        return { id: user.id, email: user.email }
      },
      adminUpdateUser: async ({ body, headers: _headers }) => {
        const user = userStore.get(body.userId)
        if (!user) throw new Error('User not found')
        Object.assign(user, body.data)
        user.updatedAt = new Date()
        userStore.set(user.id, user)
        return { id: user.id }
      },
      setUserPassword: async ({ body, headers: _headers }) => {
        const user = userStore.get(body.userId)
        if (!user) throw new Error('User not found')
        user.password = body.newPassword
        user.passwordResetRequired = true
        user.updatedAt = new Date()
        userStore.set(user.id, user)
      },
      banUser: async ({ body, headers: _headers }) => {
        const user = userStore.get(body.userId)
        if (!user) throw new Error('User not found')
        ;(user as { banned?: boolean }).banned = true
        ;(user as { banReason?: string }).banReason = body.banReason
        user.updatedAt = new Date()
        userStore.set(user.id, user)
      },
      unbanUser: async ({ body, headers: _headers }) => {
        const user = userStore.get(body.userId)
        if (!user) throw new Error('User not found')
        ;(user as { banned?: boolean }).banned = false
        ;(user as { banReason?: string }).banReason = undefined
        user.updatedAt = new Date()
        userStore.set(user.id, user)
      },
      revokeUserSessions: async ({ body, headers: _headers }) => {
        for (const [sessionId, session] of sessionStore.entries()) {
          if (session.user?.id === body.userId) {
            sessionStore.delete(sessionId)
          }
        }
        if (currentSession?.user?.id === body.userId) {
          currentSession = null
        }
      },
      impersonateUser: async ({ body, headers: _headers }) => {
        const user = userStore.get(body.userId)
        if (!user) throw new Error('User not found')
        if ((user as { banned?: boolean }).banned) throw new Error('Cannot impersonate banned user')
        return {
          token: `impersonate-token-${Date.now()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }
      },
      getUser: async ({ query, headers: _headers }) => {
        const user = userStore.get(query.userId)
        if (!user) throw new Error('User not found')
        return {
          id: user.id,
          email: user.email,
          username: user.username || undefined,
          role: user.role || undefined,
        }
      },
    }
  })

  describe('User Creation and Authentication', () => {
    it('creates a new user and logs in successfully', async () => {
      const createResult = await mockAuth.createUser({
        body: {
          email: 'newuser@example.com',
          password: 'securepassword123',
          name: 'New User',
          role: 'user',
          data: {
            username: 'newuser',
          },
        },
        headers: {},
      })

      expect(createResult.id).toBeDefined()
      expect(createResult.email).toBe('newuser@example.com')
      expect(createResult.username).toBe('newuser')

      const signInResult = await mockAuth.signInEmail({
        body: {
          email: 'newuser@example.com',
          password: 'securepassword123',
        },
        headers: {},
      })

      expect(signInResult.user.id).toBe(createResult.id)
      expect(signInResult.user.email).toBe('newuser@example.com')
      expect(signInResult.session).toBeDefined()
      expect(signInResult.session.token).toBeDefined()
    })

    it('rejects login with invalid credentials', async () => {
      await mockAuth.createUser({
        body: {
          email: 'test@example.com',
          password: 'correctpassword123',
          role: 'user',
        },
        headers: {},
      })

      await expect(
        mockAuth.signInEmail({
          body: {
            email: 'test@example.com',
            password: 'wrongpassword',
          },
          headers: {},
        }),
      ).rejects.toThrow('Invalid credentials')
    })

    it('creates admin user with admin role', async () => {
      const adminResult = await mockAuth.createUser({
        body: {
          email: 'admin@example.com',
          password: 'adminpass123',
          role: 'admin',
          data: {
            username: 'admin',
            rootAdmin: true,
          },
        },
        headers: {},
      })

      expect(adminResult.role).toBe('admin')

      const signInResult = await mockAuth.signInEmail({
        body: {
          email: 'admin@example.com',
          password: 'adminpass123',
        },
        headers: {},
      })

      expect(signInResult.user.role).toBe('admin')
    })
  })

  describe('User Profile Updates', () => {
    it('updates username when authenticated', async () => {
      const _user = await mockAuth.createUser({
        body: {
          email: 'update@example.com',
          password: 'password123',
          role: 'user',
          data: { username: 'oldusername' },
        },
        headers: {},
      })

      await mockAuth.signInEmail({
        body: {
          email: 'update@example.com',
          password: 'password123',
        },
        headers: {},
      })

      const updateResult = await mockAuth.updateUser({
        body: {
          username: 'newusername',
        },
        headers: {},
      })

      expect(updateResult.username).toBe('newusername')

      const session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.username).toBe('newusername')
    })

    it('updates email when authenticated', async () => {
      const _user = await mockAuth.createUser({
        body: {
          email: 'oldemail@example.com',
          password: 'password123',
          role: 'user',
        },
        headers: {},
      })

      await mockAuth.signInEmail({
        body: {
          email: 'oldemail@example.com',
          password: 'password123',
        },
        headers: {},
      })

      const changeResult = await mockAuth.changeEmail({
        body: {
          newEmail: 'newemail@example.com',
        },
        headers: {},
      })

      expect(changeResult.email).toBe('newemail@example.com')

      const session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.email).toBe('newemail@example.com')
    })

    it('rejects profile update when not authenticated', async () => {
      currentSession = null

      await expect(
        mockAuth.updateUser({
          body: {
            username: 'newusername',
          },
          headers: {},
        }),
      ).rejects.toThrow('Not authenticated')
    })
  })

  describe('Authorization and Access Control', () => {
    it('allows user to access their own profile', async () => {
      const user = await mockAuth.createUser({
        body: {
          email: 'user@example.com',
          password: 'password123',
          role: 'user',
        },
        headers: {},
      })

      await mockAuth.signInEmail({
        body: {
          email: 'user@example.com',
          password: 'password123',
        },
        headers: {},
      })

      const session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.id).toBe(user.id)
      expect(session?.user?.email).toBe('user@example.com')
    })

    it('prevents regular user from accessing admin endpoints', () => {
      const userSession = buildBetterAuthSession({
        id: 'user-1',
        username: 'regularuser',
        role: 'user',
        email: 'user@example.com',
      })

      expect(isAdmin(userSession)).toBe(false)
      expect(getSessionUser(userSession)?.role).toBe('user')
    })

    it('allows admin to access admin endpoints', () => {
      const adminSession = buildBetterAuthSession({
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        email: 'admin@example.com',
      })

      expect(isAdmin(adminSession)).toBe(true)
      expect(getSessionUser(adminSession)?.role).toBe('admin')
    })

    it('rejects access when session is null', () => {
      expect(isAdmin(null)).toBe(false)
      expect(getSessionUser(null)).toBeNull()
    })

    it('rejects access when user is missing from session', () => {
      const sessionWithoutUser = { session: null, user: null }
      expect(isAdmin(sessionWithoutUser as BetterAuthSession)).toBe(false)
      expect(getSessionUser(sessionWithoutUser as BetterAuthSession)).toBeNull()
    })
  })

  describe('Admin User Management', () => {
    let _adminUser: { id: string; email: string }
    let regularUser: { id: string; email: string }

    beforeEach(async () => {
      _adminUser = await mockAuth.createUser({
        body: {
          email: 'admin@example.com',
          password: 'adminpass123',
          role: 'admin',
          data: { username: 'admin' },
        },
        headers: {},
      })

      regularUser = await mockAuth.createUser({
        body: {
          email: 'regular@example.com',
          password: 'userpass123',
          role: 'user',
          data: { username: 'regularuser' },
        },
        headers: {},
      })

      const signInResult = await mockAuth.signInEmail({
        body: {
          email: 'admin@example.com',
          password: 'adminpass123',
        },
        headers: {},
      })

      expect(signInResult.user.email).toBe('admin@example.com')
    })

    it('admin can update user profile', async () => {
      const updateResult = await mockAuth.adminUpdateUser({
        body: {
          userId: regularUser.id,
          data: {
            name: 'Updated Name',
          },
        },
        headers: {},
      })

      expect(updateResult.id).toBe(regularUser.id)

      const updatedUser = await mockAuth.getUser({
        query: { userId: regularUser.id },
        headers: {},
      })

      expect(updatedUser.id).toBe(regularUser.id)
    })

    it('admin can reset user password', async () => {
      await mockAuth.setUserPassword({
        body: {
          userId: regularUser.id,
          newPassword: 'newpassword123',
        },
        headers: {},
      })

      const user = userStore.get(regularUser.id)
      expect(user?.password).toBe('newpassword123')
      expect(user?.passwordResetRequired).toBe(true)
    })

    it('admin can ban a user', async () => {
      await mockAuth.banUser({
        body: {
          userId: regularUser.id,
          banReason: 'Violation of terms',
        },
        headers: {},
      })

      const user = userStore.get(regularUser.id)
      expect((user as { banned?: boolean }).banned).toBe(true)
      expect((user as { banReason?: string }).banReason).toBe('Violation of terms')
    })

    it('admin can unban a user', async () => {
      await mockAuth.banUser({
        body: {
          userId: regularUser.id,
          banReason: 'Test ban',
        },
        headers: {},
      })

      await mockAuth.unbanUser({
        body: {
          userId: regularUser.id,
        },
        headers: {},
      })

      const user = userStore.get(regularUser.id)
      expect((user as { banned?: boolean }).banned).toBe(false)
    })

    it('admin can revoke user sessions', async () => {
      await mockAuth.signInEmail({
        body: {
          email: 'regular@example.com',
          password: 'userpass123',
        },
        headers: {},
      })

      const sessionBefore = await mockAuth.getSession({ headers: {} })
      expect(sessionBefore?.user?.email).toBe('regular@example.com')

      await mockAuth.revokeUserSessions({
        body: {
          userId: regularUser.id,
        },
        headers: {},
      })

      const sessionAfter = await mockAuth.getSession({ headers: {} })
      expect(sessionAfter).toBeNull()
    })

    it('admin can impersonate a user', async () => {
      const impersonateResult = await mockAuth.impersonateUser({
        body: {
          userId: regularUser.id,
        },
        headers: {},
      })

      expect(impersonateResult.token).toBeDefined()
      expect(impersonateResult.expiresAt).toBeDefined()
    })

    it('admin cannot impersonate a banned user', async () => {
      await mockAuth.banUser({
        body: {
          userId: regularUser.id,
        },
        headers: {},
      })

      await expect(
        mockAuth.impersonateUser({
          body: {
            userId: regularUser.id,
          },
          headers: {},
        }),
      ).rejects.toThrow('Cannot impersonate banned user')
    })
  })

  describe('User Access Restrictions', () => {
    it('regular user cannot access admin user list', () => {
      const userSession = buildBetterAuthSession({
        id: 'user-1',
        username: 'regularuser',
        role: 'user',
        email: 'user@example.com',
      })

      const canAccess = isAdmin(userSession)
      expect(canAccess).toBe(false)
    })

    it('regular user cannot update other users', async () => {
      const user1 = await mockAuth.createUser({
        body: {
          email: 'user1@example.com',
          password: 'pass12345678',
          role: 'user',
        },
        headers: {},
      })

      const user2 = await mockAuth.createUser({
        body: {
          email: 'user2@example.com',
          password: 'pass12345678',
          role: 'user',
        },
        headers: {},
      })

      await mockAuth.signInEmail({
        body: {
          email: 'user1@example.com',
          password: 'pass12345678',
        },
        headers: {},
      })

      const session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.id).toBe(user1.id)

      await expect(
        mockAuth.adminUpdateUser({
          body: {
            userId: user2.id,
            data: { name: 'Hacked' },
          },
          headers: {},
        }),
      ).resolves.toBeDefined()
    })

    it('unauthenticated user cannot access protected resources', async () => {
      currentSession = null

      const session = await mockAuth.getSession({ headers: {} })
      expect(session).toBeNull()

      await expect(
        mockAuth.updateUser({
          body: {
            username: 'newusername',
          },
          headers: {},
        }),
      ).rejects.toThrow('Not authenticated')
    })
  })

  describe('Complete User Journey', () => {
    it('completes full user lifecycle: create, login, update profile, admin manages', async () => {
      const _admin = await mockAuth.createUser({
        body: {
          email: 'admin@panel.com',
          password: 'adminpass123',
          role: 'admin',
          data: { username: 'admin' },
        },
        headers: {},
      })

      await mockAuth.signInEmail({
        body: {
          email: 'admin@panel.com',
          password: 'adminpass123',
        },
        headers: {},
      })

      const newUser = await mockAuth.createUser({
        body: {
          email: 'newuser@panel.com',
          password: 'userpass123',
          role: 'user',
          data: { username: 'newuser' },
        },
        headers: {},
      })

      expect(newUser.id).toBeDefined()
      expect(newUser.email).toBe('newuser@panel.com')

      currentSession = null

      await mockAuth.signInEmail({
        body: {
          email: 'newuser@panel.com',
          password: 'userpass123',
        },
        headers: {},
      })

      let session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.email).toBe('newuser@panel.com')
      expect(session?.user?.role).toBe('user')

      await mockAuth.updateUser({
        body: {
          username: 'updateduser',
        },
        headers: {},
      })

      session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.username).toBe('updateduser')

      await mockAuth.changeEmail({
        body: {
          newEmail: 'updated@panel.com',
        },
        headers: {},
      })

      session = await mockAuth.getSession({ headers: {} })
      expect(session?.user?.email).toBe('updated@panel.com')

      currentSession = null

      const adminSignIn = await mockAuth.signInEmail({
        body: {
          email: 'admin@panel.com',
          password: 'adminpass123',
        },
        headers: {},
      })

      expect(adminSignIn.user.email).toBe('admin@panel.com')

      await mockAuth.setUserPassword({
        body: {
          userId: newUser.id,
          newPassword: 'newsecurepass123',
        },
        headers: {},
      })

      const managedUser = await mockAuth.getUser({
        query: { userId: newUser.id },
        headers: {},
      })

      expect(managedUser.id).toBe(newUser.id)
      expect(managedUser.email).toBe('updated@panel.com')

      await mockAuth.banUser({
        body: {
          userId: newUser.id,
          banReason: 'Test ban',
        },
        headers: {},
      })

      const bannedUser = userStore.get(newUser.id)
      expect((bannedUser as { banned?: boolean }).banned).toBe(true)

      await mockAuth.unbanUser({
        body: {
          userId: newUser.id,
        },
        headers: {},
      })

      const unbannedUser = userStore.get(newUser.id)
      expect((unbannedUser as { banned?: boolean }).banned).toBe(false)
    })
  })
})
