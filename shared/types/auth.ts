export type Role = 'admin' | 'user';

export interface SanitizedUser {
  id: string;
  username: string;
  email: string;
  role: Role;
}

export interface SessionData {
  user: SanitizedUser;
  issuedAt: string;
  expiresAt: string;
}

export interface SessionUser {
  id?: string | null;
  username?: string | null;
  email?: string | null;
  role?: Role | null;
  name?: string | null;
  image?: string | null;
  permissions?: string[];
  remember?: boolean | null;
  passwordResetRequired?: boolean | null;
}

export interface AuthenticatedSession {
  user?: SessionUser | null;
}

export interface ResolvedSessionUser extends SessionUser {
  id: string;
  username: string;
  role: Role;
  permissions: string[];
  passwordResetRequired: boolean;
}

export interface ServerSessionUser extends SessionUser {
  id: string;
  username: string;
  role: Role;
  permissions: string[];
  passwordResetRequired: boolean;
}

export interface ExtendedSession {
  user: ServerSessionUser | null;
}

export interface AuthContext {
  session: Awaited<ReturnType<typeof import('~~/server/utils/session').getServerSession>>;
  user: ResolvedSessionUser;
  apiKey?: {
    id: string;
    userId: string;
    permissions: import('#shared/types/admin').ApiKeyPermissions;
  };
}

export interface UserSessionSummary {
  token: string;
  issuedAt: string;
  expiresAt: string;
  expiresAtTimestamp: number;
  isCurrent: boolean;
  ipAddress: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  lastSeenAt: string | null;
  firstSeenAt: string | null;
  fingerprint: string | null;
}

export interface SessionMetadata {
  sessionToken: string | null;
  remember: boolean;
  refreshedAt: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  role?: Role;
}

export interface UpdatePasswordOptions {
  preserveToken?: string;
}

export interface UpdatePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}

export interface AccountProfileResponse {
  data: SanitizedUser;
}

export interface AccountSessionsResponse {
  data: UserSessionSummary[];
  currentToken: string | null;
}

export interface AccountSessionRow {
  sessionToken: string;
  expires: Date | number | string;
  metadataIp?: string | null;
  metadataUserAgent?: string | null;
  metadataDevice?: string | null;
  metadataBrowser?: string | null;
  metadataOs?: string | null;
  firstSeenAt?: Date | number | string | null;
  lastSeenAt?: Date | number | string | null;
}

export interface SessionMetadataUpsertInput {
  sessionToken: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  browserName: string | null;
  osName: string | null;
  firstSeenAt?: Date | null;
}

export interface AuthCredentials {
  identity: string;
  password: string;
  token?: string;
}

export interface AuthExtendedUser {
  id: string;
  email: string | null;
  username: string;
  role: Role;
  permissions: string[];
  useTotp: boolean;
  totpAuthenticatedAt: number | null;
  passwordResetRequired: boolean;
}

export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface RuntimeAuthConfig {
  tokenSecret?: string;
  cookie?: {
    secure?: boolean;
    sameSite?: CookieSameSite;
    domain?: string;
  };
}

export interface ExtendedRuntimeConfig {
  auth?: RuntimeAuthConfig;
}

export interface AuthCookieOptions {
  secure: boolean;
  sameSite: CookieSameSite;
  domain?: string;
}
