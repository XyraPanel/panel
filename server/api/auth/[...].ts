import { randomUUID } from 'node:crypto'
import { NuxtAuthHandler } from '#auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { AuthOptions } from 'next-auth'
import bcrypt from 'bcryptjs'
import { defineEventHandler, getQuery, sendRedirect, type EventHandler } from 'h3'
import { useDrizzle, tables, eq, or } from '~~/server/utils/drizzle'
import { verifyRecoveryToken, verifyTotpToken } from '~~/server/utils/totp'
import type { Role, AuthCredentials as Credentials, AuthExtendedUser as ExtendedUser } from '#shared/types/auth'

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

const runtimeConfig = useRuntimeConfig()
const credentialsProvider = (CredentialsProvider as unknown as { default?: typeof CredentialsProvider }).default ?? CredentialsProvider

function resolveLoginRedirect(query: Record<string, unknown>): string {
  const rawCallback = typeof query.callbackUrl === 'string' ? query.callbackUrl : undefined
  const redirectTarget = rawCallback && rawCallback.startsWith('/') ? rawCallback : '/'

  const params = new URLSearchParams()
  if (redirectTarget !== '/')
    params.set('redirect', redirectTarget)

  const error = typeof query.error === 'string' ? query.error.trim() : ''
  if (error.length > 0)
    params.set('error', error)

  const search = params.toString()
  return search.length > 0 ? `/auth/login?${search}` : '/auth/login'
}

function upsertSessionRecord(params: { sessionToken: string; userId: string; expires: Date }) {
  const { sessionToken, userId, expires } = params
  const db = useDrizzle()
  const now = new Date()

  db.insert(tables.sessions)
    .values({
      sessionToken,
      userId,
      expires,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: tables.sessions.sessionToken,
      set: {
        userId,
        expires,
        updatedAt: now,
      },
    })
    .run()
}

const authHandler = NuxtAuthHandler({
  secret: runtimeConfig.authSecret,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },

  providers: [
    credentialsProvider({
      name: 'Credentials',
      credentials: {
        identity: { label: 'Username or Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        token: { label: 'Two-factor token', type: 'text', placeholder: '123456 or recovery token' },
      },
      async authorize(credentials: Credentials | undefined) {
        if (!credentials?.identity || !credentials?.password) {
          return null
        }

        const db = useDrizzle()

        const user = db
          .select()
          .from(tables.users)
          .where(
            or(
              eq(tables.users.username, credentials.identity),
              eq(tables.users.email, credentials.identity)
            )
          )
          .get()

        if (!user) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          return null
        }

        if (user.useTotp) {
          const rawToken = credentials.token?.trim()
          if (!rawToken) {
            throw new Error('Two-factor authentication token required.')
          }

          const totpInput = rawToken.replaceAll(' ', '')
          const recoveryInput = rawToken.replaceAll(' ', '').toUpperCase()

          let recoveryTokenId: string | null = null
          let isTotpValid = false

          if (user.totpSecret) {
            isTotpValid = verifyTotpToken(totpInput, user.totpSecret)
          }

          if (!isTotpValid) {
            const recoveryTokens = useDrizzle()
              .select()
              .from(tables.recoveryTokens)
              .where(eq(tables.recoveryTokens.userId, user.id))
              .all()

            for (const recoveryToken of recoveryTokens) {
              if (recoveryToken.usedAt)
                continue

              const matches = await verifyRecoveryToken(recoveryInput, recoveryToken.token)
              if (matches) {
                recoveryTokenId = recoveryToken.id
                break
              }
            }

            if (!recoveryTokenId) {
              throw new Error('Invalid two-factor authentication token.')
            }
          }

          const now = new Date()
          useDrizzle()
            .update(tables.users)
            .set({ totpAuthenticatedAt: now, updatedAt: now })
            .where(eq(tables.users.id, user.id))
            .run()

          if (recoveryTokenId) {
            useDrizzle()
              .update(tables.recoveryTokens)
              .set({ usedAt: now })
              .where(eq(tables.recoveryTokens.id, recoveryTokenId))
              .run()
          }
        }

        const fullName = [user.nameFirst, user.nameLast].filter(Boolean).join(' ') || user.username
        const role = (user.role === 'admin' ? 'admin' : 'user') as Role
        const permissions = role === 'admin' || user.rootAdmin ? ADMIN_PANEL_PERMISSIONS : []
        return {
          id: user.id,
          email: user.email,
          name: fullName,
          username: user.username,
          role,
          permissions,
          useTotp: user.useTotp ?? false,
          totpAuthenticatedAt: user.totpAuthenticatedAt ?? null,
        }
      },
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      const configuredOrigin = typeof runtimeConfig.authOrigin === 'string'
        && /^https?:\/\//.test(runtimeConfig.authOrigin)
        ? runtimeConfig.authOrigin.replace(/\/$/, '')
        : null

      const normalizedBase = configuredOrigin
        ?? (typeof baseUrl === 'string' && /^https?:\/\//.test(baseUrl)
          ? new URL(baseUrl).origin.replace(/\/$/, '')
          : 'http://localhost:3000')

      if (!url) {
        return `${normalizedBase}/`
      }

      if (url.startsWith('/')) {
        return `${normalizedBase}${url}`
      }

      try {
        const absoluteTarget = /^https?:\/\//.test(url)
          ? new URL(url)
          : new URL(url, `${normalizedBase}/`)

        if (absoluteTarget.origin === normalizedBase) {
          return absoluteTarget.toString()
        }
      }
      catch (error) {
        console.error('Invalid redirect URL', { url, baseUrl, normalizedBase, error })
      }

      return `${normalizedBase}/`
    },

    async jwt({ token, user }) {

      if (user) {
        const extendedUser = user as ExtendedUser
        token.id = user.id
        token.email = user.email

        token.username = extendedUser.username

        token.role = extendedUser.role

        token.permissions = extendedUser.permissions || []

        token.useTotp = !!extendedUser.useTotp

        token.totpAuthenticatedAt = extendedUser.totpAuthenticatedAt
          ? new Date(extendedUser.totpAuthenticatedAt).toISOString()
          : null
        if (!token.sessionToken) {
          token.sessionToken = randomUUID()
        }

        if (user.id) {
          const expiresNumeric = typeof token.exp === 'number'
            ? token.exp * 1000
            : Date.now() + (30 * 24 * 60 * 60 * 1000)
          upsertSessionRecord({
            sessionToken: token.sessionToken as string,
            userId: user.id,
            expires: new Date(expiresNumeric),
          })
        }
      } else if (token.id) {
        const db = useDrizzle()
        const dbUser = db
          .select({
            useTotp: tables.users.useTotp,
            totpAuthenticatedAt: tables.users.totpAuthenticatedAt,
          })
          .from(tables.users)
          .where(eq(tables.users.id, token.id as string))
          .get()

        if (dbUser) {
          token.useTotp = !!dbUser.useTotp
          token.totpAuthenticatedAt = dbUser.totpAuthenticatedAt
            ? new Date(dbUser.totpAuthenticatedAt).toISOString()
            : null
        }
      }
      return token
    },

    async session({ session, token }) {

      if (token && session.user) {
        const tokenData = token as Record<string, unknown>
        const sessionUser = session.user as Record<string, unknown>

        sessionUser.id = token.id as string
        sessionUser.username = token.username as string
        sessionUser.role = token.role as string
        sessionUser.permissions = token.permissions as string[]
        sessionUser.useTotp = !!tokenData.useTotp
        sessionUser.totpAuthenticatedAt = (tokenData.totpAuthenticatedAt as Date | string | null | undefined) ?? null
      }

      if (token?.sessionToken && typeof token.id === 'string') {
        const expiresNumeric = typeof token.exp === 'number'
          ? token.exp * 1000
          : Date.now() + (30 * 24 * 60 * 60 * 1000)
        upsertSessionRecord({
          sessionToken: token.sessionToken as string,
          userId: token.id,
          expires: new Date(expiresNumeric),
        })
      }
      return session
    },
  },
} as AuthOptions) as EventHandler

export default defineEventHandler(async (event) => {
  const path = event.path || event.node.req.url?.split('?')[0] || ''
  if (event.method === 'GET' && path.endsWith('/callback/credentials')) {
    const query = getQuery(event)
    const destination = resolveLoginRedirect(query as Record<string, unknown>)
    return sendRedirect(event, destination, 302)
  }

  return authHandler(event)
})
