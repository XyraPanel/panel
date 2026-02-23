export interface BetterAuthSession {
  session?: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
  } | null;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    username?: string | null;
    role?: string | null;
    image?: string | null;
    permissions?: string[];
    remember?: boolean | null;
    passwordResetRequired?: boolean | null;
    emailVerified?: boolean | null;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;
}

export interface ResolvedUser {
  id: string;
  username: string;
  role: string;
  permissions: string[];
  email: string | null;
  name: string | null;
  image: string | null;
  remember: boolean | null;
  passwordResetRequired: boolean;
}

export const basePayload = {
  username: 'new-admin',
  email: 'admin@example.com',
  password: 'supersafepass',
  name: 'New Admin',
  role: 'admin' as const,
};

export function buildBetterAuthSession(
  overrides: Partial<BetterAuthSession['user']> & {
    id?: string;
    username?: string;
    role?: 'admin' | 'user';
    permissions?: string[];
    remember?: boolean | null;
    passwordResetRequired?: boolean;
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
  };

  return {
    session: {
      id: 'session-123',
      token: 'session-token-123',
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    },
    user,
  };
}

export function getSessionUser(session: BetterAuthSession | null): ResolvedUser | null {
  if (!session?.user) {
    return null;
  }

  const candidate = session.user;

  if (!candidate.id || !candidate.username || !candidate.role) {
    return null;
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
  };
}

export function resolveSessionUser(session: BetterAuthSession | null): ResolvedUser | null {
  const user = getSessionUser(session);

  if (!user || !user.id || !user.username || !user.role) {
    return null;
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
  };
}

export function isAdmin(session: BetterAuthSession | null): boolean {
  const user = getSessionUser(session);
  if (!user) {
    return false;
  }
  return user.role === 'admin';
}
