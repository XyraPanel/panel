import { betterAuth } from "better-auth"
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, haveIBeenPwned, bearer, multiSession, customSession, captcha, username, twoFactor } from "better-auth/plugins"
import { createAuthMiddleware, APIError } from 'better-auth/api'
import type { AuthContext } from '@better-auth/core'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import type { Role } from '#shared/types/auth'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'

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

/**
 * Checks existing passwords on login against Have I Been Pwned API and sets database flag.
 */
export async function checkPasswordCompromised(userId: string, password: string): Promise<void> {
  try {
    // CodeQL [js/insufficient-password-hash] SHA1 required by HIBP API, not for password storage
    const sha1Hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
    const prefix = sha1Hash.substring(0, 5)
    const suffix = sha1Hash.substring(5)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'User-Agent': 'XyraPanel' },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return
      }

      const data = await response.text()
      const lines = data.split(/\r?\n/).filter(line => line.trim().length > 0)
      const hashes = lines.map(line => {
        const trimmed = line.trim()
        const colonIndex = trimmed.indexOf(':')
        return colonIndex > 0 ? trimmed.substring(0, colonIndex) : trimmed
      }).filter(Boolean)
      
      const isCompromised = hashes.includes(suffix)
      
      if (isCompromised) {
        const db = useDrizzle()
        await db.update(tables.users)
          .set({ passwordCompromised: true, updatedAt: new Date() })
          .where(eq(tables.users.id, userId))
          .run()
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return
      }
      throw fetchError
    }
  }
  catch {
    // Silently fail password compromise check
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
      passwordCompromised: tables.users.passwordCompromised,
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
    passwordCompromised: Boolean(dbUser.passwordCompromised),
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
      provider: 'sqlite',
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
          const { sendEmail } = await import('~~/server/utils/email')
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
          const { sendEmail } = await import('~~/server/utils/email')
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
        verify: async ({ hash, password }: { hash: string; password: string; userId?: string }) => {
          return await bcrypt.compare(password, hash)
        },
      },
      sendResetPassword: async ({ user, token }, _request) => {
        const { sendPasswordResetEmail, resolvePanelBaseUrl } = await import('~~/server/utils/email')
        const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`
        await sendPasswordResetEmail(user.email, token, resetBaseUrl)
      },
      resetPasswordTokenExpiresIn: 3600,
      onPasswordReset: async ({ user }, _request) => {
        const db = useDrizzle()
        await db.delete(tables.sessions)
          .where(eq(tables.sessions.userId, user.id))
          .run()
        
        await db.update(tables.users)
          .set({ 
            passwordResetRequired: false,
            passwordCompromised: false,
          })
          .where(eq(tables.users.id, user.id))
          .run()
      },
    },
    session: {
      expiresIn: 14 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
        refreshCache: false,
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
        const { sendEmailVerificationEmail } = await import('~~/server/utils/email')
        await sendEmailVerificationEmail({
          to: user.email,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 24 * 1000),
          username: (user as { username?: string }).username || user.name || null,
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
        const request = (ctx as { request?: { url?: string; method?: string } }).request
        const isProduction = process.env.NODE_ENV === 'production'
        const path = request?.url || 'unknown'
        const isAuthPath = path.startsWith('/api/auth')
        
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith('/sign-in')) {
          const { getSetting, SETTINGS_KEYS } = await import('~~/server/utils/settings')
          const maintenanceMode = getSetting(SETTINGS_KEYS.MAINTENANCE_MODE) === 'true'
          
          if (maintenanceMode) {
            const requestBody = (ctx as { body?: { email?: string; username?: string } }).body
            const identifier = requestBody?.email || requestBody?.username
            
            if (identifier) {
              const db = useDrizzle()
              const user = db
                .select({
                  role: tables.users.role,
                  rootAdmin: tables.users.rootAdmin,
                })
                .from(tables.users)
                .where(
                  identifier.includes('@')
                    ? eq(tables.users.email, identifier)
                    : eq(tables.users.username, identifier)
                )
                .get()
              
              const isAdmin = user?.rootAdmin || user?.role === 'admin'
              
              if (!isAdmin) {
                throw new APIError('FORBIDDEN', {
                  message: 'The panel is currently under maintenance. Please try again later.',
                })
              }
            }
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith('/sign-in')) {
          const newSession = ctx.context.newSession
          const requestBody = (ctx as { body?: { password?: string } }).body
          const password = requestBody?.password

          if (newSession?.user?.id && password) {
            await checkPasswordCompromised(newSession.user.id, password)
          }
        }
      }),
    },
    plugins: [
      ...(runtimeConfig.turnstile.secretKey ? [captcha({
        provider: 'cloudflare-turnstile',
        secretKey: runtimeConfig.turnstile.secretKey,
      })] : []),
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
      }),
      twoFactor({
        issuer: runtimeConfig.public.appName || 'XyraPanel',
      }),
      haveIBeenPwned({
        customPasswordCompromisedMessage: 'This password has been found in a data breach. Please choose a more secure password.',
      }),
      admin({
        adminRoles: ['admin'],
        defaultRole: 'user',
        impersonationSessionDuration: 60 * 60,
        defaultBanReason: 'No reason provided',
        bannedUserMessage: 'You have been banned from this application. Please contact support if you believe this is an error.',
      }),
      // API key plugin disabled 
      // Better Auth's drizzle adapter can't query the apikey table properly
      // apiKey({
      //   enableSessionForAPIKeys: true,
      //   apiKeyHeaders: ['x-api-key', 'authorization'],
      //   enableMetadata: true,
      //   disableKeyHashing: true,
      // }),
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

        const name = dbUser
          ? [dbUser.nameFirst, dbUser.nameLast].filter(Boolean).join(' ') || dbUser.username
          : user.name || (user as { username?: string }).username || null

        return {
          user: {
            ...user,
            role: userData.role,
            permissions: userData.permissions,
            passwordResetRequired: userData.passwordResetRequired,
            passwordCompromised: userData.passwordCompromised,
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
