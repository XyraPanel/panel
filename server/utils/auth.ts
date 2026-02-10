import { betterAuth } from "better-auth"
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, bearer, multiSession, customSession, captcha, username, twoFactor, apiKey } from "better-auth/plugins"
import type { AuthContext } from '@better-auth/core'
import { useDrizzle, tables, eq, isPostgresDialect } from '#server/utils/drizzle'
import type { Role } from '#shared/types/auth'
import bcrypt from 'bcryptjs'

let authInstance: ReturnType<typeof betterAuth> | null = null

const ADMIN_PANEL_PERMISSIONS = [
  'admin.users.read',
  'admin.servers.read',
  'admin.nodes.read',
  'admin.locations.read',
  'admin.eggs.read',
  'admin.mounts.read',
  'admin.database-hosts.read',
  'admin.activity.read',
  'admin.settings.read',
]

interface CaptchaConfig {
  provider: 'cloudflare-turnstile' | 'google-recaptcha' | 'hcaptcha'
  secretKey: string
  minScore?: number
  siteKey?: string
}

function getCaptchaConfig(provider: string, runtimeConfig: ReturnType<typeof useRuntimeConfig>): CaptchaConfig | null {
  const normalizedProvider = provider.toLowerCase()
  
  switch (normalizedProvider) {
    case 'turnstile':
    case 'cloudflare-turnstile':
      if (runtimeConfig.turnstile?.secretKey) {
        return {
          provider: 'cloudflare-turnstile',
          secretKey: runtimeConfig.turnstile.secretKey,
        }
      }
      return null
      
    case 'recaptcha':
    case 'google-recaptcha':
      if (runtimeConfig.recaptcha?.secretKey) {
        return {
          provider: 'google-recaptcha',
          secretKey: runtimeConfig.recaptcha.secretKey,
          minScore: runtimeConfig.recaptcha?.minScore || 0.5,
        }
      }
      return null
      
    case 'hcaptcha':
      if (runtimeConfig.hcaptcha?.secretKey) {
        return {
          provider: 'hcaptcha',
          secretKey: runtimeConfig.hcaptcha.secretKey,
          siteKey: runtimeConfig.hcaptcha?.siteKey,
        }
      }
      return null
      
    default:
      return null
  }
}

async function getUserPermissionsAndRole(userId: string) {
  const db = useDrizzle()
  const dbUser = db
    .select({
      id: tables.users.id,
      role: tables.users.role,
      rootAdmin: tables.users.rootAdmin,
      passwordResetRequired: tables.users.passwordResetRequired,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!dbUser) {
    return null
  }

  const derivedRole: Role = dbUser.rootAdmin || dbUser.role === 'admin' ? 'admin' : 'user'
  const permissions = derivedRole === 'admin' ? ADMIN_PANEL_PERMISSIONS : []

  return {
    role: derivedRole,
    permissions,
    passwordResetRequired: Boolean(dbUser.passwordResetRequired),
  }
}

function createAuth() {
  const runtimeConfig = useRuntimeConfig()
  const db = useDrizzle()
  
  const isProduction = process.env.NODE_ENV === 'production'
  
  const baseURL = runtimeConfig.authOrigin 
    || process.env.BETTER_AUTH_URL
    || process.env.AUTH_ORIGIN
    || process.env.NUXT_AUTH_ORIGIN
    || process.env.NUXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || undefined
  
  const secret = runtimeConfig.authSecret || undefined
  const captchaProvider = (process.env.CAPTCHA_PROVIDER || 'turnstile').toLowerCase()
  const captchaConfig = getCaptchaConfig(captchaProvider, runtimeConfig)
  
  if (isProduction) {
    if (!secret) {
      throw new Error('BETTER_AUTH_SECRET is required in production. Set it in your environment variables.')
    }
    if (!baseURL) {
      throw new Error('BETTER_AUTH_URL (authOrigin) is required in production. Set it in your environment variables.')
    }
  }
  
  const trustedOrigins: string[] = []
  
  if (baseURL) {
    trustedOrigins.push(baseURL)
  }
  
  if (!isProduction) {
    if (!trustedOrigins.includes('http://localhost:3000')) {
      trustedOrigins.push('http://localhost:3000')
    }
  }
  
  if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
    const additionalOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
      .filter(origin => !trustedOrigins.includes(origin)) 
    trustedOrigins.push(...additionalOrigins)
  }

  if (process.env.NUXT_SECURITY_CORS_ORIGIN) {
    const corsOrigins = process.env.NUXT_SECURITY_CORS_ORIGIN
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
      .filter(origin => !trustedOrigins.includes(origin))
    trustedOrigins.push(...corsOrigins)
  }
  
  const appUrl = process.env.NUXT_PUBLIC_APP_URL || process.env.APP_URL
  if (appUrl && appUrl !== baseURL && !trustedOrigins.includes(appUrl)) {
    trustedOrigins.push(appUrl)
  }
  
  const ipAddressHeaders = process.env.BETTER_AUTH_IP_HEADER
    ? [process.env.BETTER_AUTH_IP_HEADER]
    : ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']
  
  const adapterSchema = {
    user: tables.users,
    session: tables.sessions,
    account: tables.accounts,
    verificationToken: tables.verificationTokens,
    rateLimit: tables.rateLimit,
    apikey: tables.apiKeys,
    twoFactor: tables.twoFactor,
    jwks: tables.jwks,
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: isPostgresDialect ? 'pg' : 'sqlite',
      schema: adapterSchema,
    }),
    account: {
      fields: {
        providerId: 'provider',
        accountId: 'providerAccountId',
      },
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        updateUserInfoOnLink: true,
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }, _request) => {
          const { sendEmail } = await import('#server/utils/email')
          await sendEmail({
            to: user.email,
            subject: 'Confirm Email Change',
            html: `
              <h2>Confirm Email Change</h2>
              <p>You requested to change your email address to <strong>${newEmail}</strong>.</p>
              <p>Click the link below to confirm this change:</p>
              <p><a href="${url}">Confirm Email Change</a></p>
              <p>If you didn't request this change, please ignore this email.</p>
            `,
          })
        },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }, _request) => {
          const { sendEmail } = await import('#server/utils/email')
          await sendEmail({
            to: user.email,
            subject: 'Confirm Account Deletion',
            html: `
              <h2>Confirm Account Deletion</h2>
              <p>You requested to delete your ${runtimeConfig.public.appName || 'XyraPanel'} account.</p>
              <p><strong>Warning:</strong> This action cannot be undone. All your data, servers, and settings will be permanently deleted.</p>
              <p>Click the link below to confirm account deletion:</p>
              <p><a href="${url}" style="color: #ef4444; font-weight: bold;">Delete My Account</a></p>
              <p>If you didn't request this, please ignore this email and secure your account.</p>
            `,
          })
        },
        beforeDelete: async (user, _request) => {
          const db = useDrizzle()
          const dbUser = db
            .select({
              rootAdmin: tables.users.rootAdmin,
              role: tables.users.role,
            })
            .from(tables.users)
            .where(eq(tables.users.id, user.id))
            .get()
          
          if (dbUser?.rootAdmin || dbUser?.role === 'admin') {
            throw new (await import('better-auth/api')).APIError('BAD_REQUEST', {
              message: 'Admin accounts cannot be deleted',
            })
          }
        },
      },
    },
    ...(secret && { secret }),
    ...(baseURL && { baseURL }),
    basePath: '/api/auth',
    appName: runtimeConfig.public.appName || 'XyraPanel',
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password: string) => {
          return await bcrypt.hash(password, 12)
        },
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          return await bcrypt.compare(password, hash)
        },
      },
      sendResetPassword: async ({ user, token }, _request) => {
        const { sendPasswordResetEmail, resolvePanelBaseUrl } = await import('#server/utils/email')
        const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`
        await sendPasswordResetEmail(user.email, token, resetBaseUrl)
      },
      resetPasswordTokenExpiresIn: 3600,
      onPasswordReset: async ({ user }, _request) => {
        const db = useDrizzle()
        db.delete(tables.sessions)
          .where(eq(tables.sessions.userId, user.id))
          .run()
        
        db.update(tables.users)
          .set({ 
            passwordResetRequired: false,
          })
          .where(eq(tables.users.id, user.id))
          .run()
      },
    },
    session: {
      expiresIn: 14 * 24 * 60 * 60,
      updateAge: 12 * 60 * 60,
      freshAge: 5 * 60,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
      },
      fields: {
        token: 'sessionToken',
        expiresAt: 'expires',
        userId: 'userId',
      },
    },
    verification: {
      fields: {
        value: 'token',
        expiresAt: 'expires',
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, token }, _request) => {
        const { sendEmailVerificationEmail } = await import('#server/utils/email')
        const rawUser = user as Record<string, unknown>
        const username = typeof rawUser.username === 'string' ? rawUser.username : user.name || null
        await sendEmailVerificationEmail({
          to: user.email,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 24 * 1000),
          username,
        })
      },
    },
    trustedOrigins,
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: 'database',
      customRules: {
        '/sign-in/email': {
          window: 10,
          max: 3,
        },
        '/sign-in/username': {
          window: 10,
          max: 3,
        },
        '/two-factor/verify': {
          window: 10,
          max: 3,
        },
        '/change-password': {
          window: 60,
          max: 5,
        },
        '/api-key/create': {
          window: 60,
          max: 10,
        },
      },
    },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: !isProduction,
      useSecureCookies: isProduction,
      ipAddress: {
        ipAddressHeaders,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax', // strict can break flows
      },
    },
    onAPIError: {
      throw: false,
      onError: (error: unknown, ctx: AuthContext) => {
        const maybeRequest = 'request' in ctx ? (ctx as { request?: unknown }).request : undefined
        const request = maybeRequest instanceof Request ? maybeRequest : undefined
        const isProduction = process.env.NODE_ENV === 'production'
        let path = 'unknown'
        if (request?.url) {
          try {
            path = new URL(request.url).pathname
          }
          catch {
            path = request.url
          }
        }
        const isAuthPath = path.startsWith('/api/auth')

        if (path.startsWith('/api/auth/sign-in')) {
          const maybeBody = 'body' in ctx ? (ctx as { body?: unknown }).body : undefined
          const identifier = (maybeBody && typeof maybeBody === 'object')
            ? ((maybeBody as { email?: string }).email || (maybeBody as { username?: string }).username || null)
            : null
          const headers = request?.headers
          const ip = headers
            ? ipAddressHeaders
              .map(header => headers.get(header))
              .find(value => Boolean(value))
            : null
          const reason = error instanceof Error ? error.message : String(error)
          console.warn('[auth][sign-in-failed]', {
            path,
            method: request?.method || 'UNKNOWN',
            identifier,
            ip: ip?.split(',')[0]?.trim() || null,
            reason,
          })
        }

        if (isProduction) {
          if (isAuthPath) {
            return
          }

          const errorName = error instanceof Error ? error.name : 'UnknownError'
          if (errorName === 'APIError' || errorName === 'ValidationError') {
            return
          }
        }
      },
    },
    logger: {
      disabled: false,
      level: isProduction ? 'error' : 'warn',
    },
    hooks: undefined,
    plugins: [
      ...(captchaConfig ? [captcha({
        provider: captchaConfig.provider,
        secretKey: captchaConfig.secretKey,
        ...(captchaConfig.minScore && { minScore: captchaConfig.minScore }),
        ...(captchaConfig.siteKey && { siteKey: captchaConfig.siteKey }),
      })] : []),
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
      }),
      twoFactor({
        issuer: runtimeConfig.public.appName || 'XyraPanel',
      }),
      admin({
        adminRoles: ['admin'],
        defaultRole: 'user',
        impersonationSessionDuration: 60 * 60,
        defaultBanReason: 'No reason provided',
        bannedUserMessage: 'You have been banned from this application. Please contact support if you believe this is an error.',
      }),
      apiKey({
        apiKeyHeaders: ['x-api-key'],
        customAPIKeyGetter: (ctx) => {
          const bearer = ctx.headers?.get('authorization')
          if (bearer?.startsWith('Bearer ')) {
            const token = bearer.slice(7).trim()
            if (token) {
              return token
            }
          }
          const headerKey = ctx.headers?.get('x-api-key')
          return headerKey || null
        },
        enableSessionForAPIKeys: true,
        disableKeyHashing: false,
        defaultKeyLength: 32,
        fallbackToDatabase: true,
      }),
      bearer(),
      multiSession({
        maximumSessions: 5,
      }),
      customSession(async ({ user, session }) => {
        if (!user?.id) {
          return { user, session }
        }

        const userData = await getUserPermissionsAndRole(user.id)
        if (!userData) {
          return { user, session }
        }

        const db = useDrizzle()
        const dbUser = db
          .select({
            nameFirst: tables.users.nameFirst,
            nameLast: tables.users.nameLast,
            username: tables.users.username,
          })
          .from(tables.users)
          .where(eq(tables.users.id, user.id))
          .get()

        const rawUser = user as Record<string, unknown>
        const name = dbUser
          ? [dbUser.nameFirst, dbUser.nameLast].filter(Boolean).join(' ') || dbUser.username
          : user.name || (typeof rawUser.username === 'string' ? rawUser.username : null)

        return {
          user: {
            ...user,
            role: userData.role,
            permissions: userData.permissions,
            passwordResetRequired: userData.passwordResetRequired,
            name,
          },
          session,
        }
      }),
    ],
  })
}

export function getAuth() {
  if (!authInstance) {
    authInstance = createAuth()
  }
  return authInstance
}

export const auth = getAuth()

/**
 * Normalizes H3 event headers to a format compatible with Better Auth API.
 * Converts header arrays to single strings and ensures all headers are strings.
 * 
 * @param headers - Headers from H3 event (event.node.req.headers)
 * @returns Record<string, string> - Normalized headers object
 * 
 * @example
 * ```ts
 * const headers = normalizeHeadersForAuth(event.node.req.headers)
 * const session = await auth.api.getSession({ headers })
 * ```
 */
export function normalizeHeadersForAuth(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalized[key] = Array.isArray(value) ? value[0]! : value
    }
  }
  return normalized
}
