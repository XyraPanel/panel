import { createError, defineEventHandler, sendRedirect, type H3Event } from 'h3'
import { requireSessionUser } from '~~/server/utils/auth/sessionUser'
import { getServerSession } from '~~/server/utils/session'
import { getAuth, normalizeHeadersForAuth } from '~~/server/utils/auth'
import type { AuthContext } from '#shared/types/auth'

const PUBLIC_ASSET_PREFIXES = [
  '/_nuxt/',
  '/__nuxt_devtools__/',
  '/_ipx/',
  '/public/',
]

const PUBLIC_ASSET_PATHS = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
  '/site.webmanifest',
  '/sw.js',
  '/service-worker.js',
])

const PUBLIC_PAGE_PATTERNS = [
  /^\/auth(?:\/|$)/,
]

const PROTECTED_PAGE_PATTERNS = [
  /^\/$/,
  /^\/account(?:\/|$)/,
  /^\/admin(?:\/|$)/,
  /^\/server(?:\/|$)/,
]

const PUBLIC_API_PATTERNS = [
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/account\/register(?:\/|$)/,
  /^\/api\/branding(?:\/|$)/,
  /^\/api\/remote(?:\/|$)/,
  /^\/api\/application(?:\/|$)/,
  /^\/api\/_nuxt_icon(?:\/|$)/,
  /^\/api\/_nuxt(?:\/|$)/,
  /^\/api\/maintenance-status(?:\/|$)/,
]

function isAssetPath(path: string): boolean {
  return PUBLIC_ASSET_PATHS.has(path)
    || PUBLIC_ASSET_PREFIXES.some(prefix => path.startsWith(prefix))
    || (path.includes('.') && !path.startsWith('/api/'))
}

function matchesPattern(patterns: RegExp[], path: string): boolean {
  return patterns.some(pattern => pattern.test(path))
}

function isProtectedPagePath(path: string): boolean {
  return matchesPattern(PROTECTED_PAGE_PATTERNS, path)
}

function isPublicPagePath(path: string): boolean {
  return matchesPattern(PUBLIC_PAGE_PATTERNS, path)
}

function isPublicApiPath(path: string): boolean {
  return matchesPattern(PUBLIC_API_PATTERNS, path)
}

function redirectToLogin(event: H3Event, requestUrl: string) {
  const path = event.path ?? requestUrl.split('?')[0] ?? '/'
  const searchParams = new URLSearchParams()
  if (path !== '/auth/login' && !path.startsWith('/auth/')) {
    searchParams.set('redirect', requestUrl)
  }

  const redirectTarget = searchParams.size > 0
    ? `/auth/login?${searchParams.toString()}`
    : '/auth/login'

  return sendRedirect(event, redirectTarget, 302)
}

export default defineEventHandler(async (event) => {
  const requestUrl = event.node.req.url ?? '/'
  const path = event.path ?? requestUrl.split('?')[0] ?? '/'

  if (!path || isAssetPath(path)) {
    return
  }

  const isApiRequest = path.startsWith('/api/')

  if (isApiRequest && isPublicApiPath(path)) {
    return
  }

  if (!isApiRequest && isPublicPagePath(path)) {
    return
  }

  if (!isApiRequest && !isProtectedPagePath(path)) {
    return
  }

  const existingAuth = (event.context as { auth?: AuthContext }).auth
  if (existingAuth?.session && existingAuth.user) {
    return
  }

  if (isApiRequest) {
    const authHeader = event.node.req.headers.authorization
    const apiKeyHeader = event.node.req.headers['x-api-key']
    
    if (apiKeyHeader || (authHeader && authHeader.startsWith('Bearer '))) {
      const auth = getAuth()
      
      try {
        const session = await auth.api.getSession({
          headers: normalizeHeadersForAuth(event.node.req.headers),
        })
        
        if (session?.user?.id) {
          const { useDrizzle, tables, eq } = await import('~~/server/utils/drizzle')
          const db = useDrizzle()
          
          const apiKeyValue = typeof apiKeyHeader === 'string' 
            ? apiKeyHeader 
            : Array.isArray(apiKeyHeader) 
              ? apiKeyHeader[0] 
              : typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
                ? authHeader.slice(7)
                : null
          const identifier = apiKeyValue?.split('.')[0] || null
          
          const apiKeyRecord = identifier
            ? db
                .select({
                  id: tables.apiKeys.id,
                  keyType: tables.apiKeys.keyType,
                  rServers: tables.apiKeys.rServers,
                  rNodes: tables.apiKeys.rNodes,
                  rAllocations: tables.apiKeys.rAllocations,
                  rUsers: tables.apiKeys.rUsers,
                  rLocations: tables.apiKeys.rLocations,
                  rNests: tables.apiKeys.rNests,
                  rEggs: tables.apiKeys.rEggs,
                  rDatabaseHosts: tables.apiKeys.rDatabaseHosts,
                  rServerDatabases: tables.apiKeys.rServerDatabases,
                })
                .from(tables.apiKeys)
                .where(eq(tables.apiKeys.identifier, identifier))
                .get()
            : null
          
          if (apiKeyRecord?.id) {
            const now = new Date()
            await db.update(tables.apiKeys)
              .set({ 
                lastUsedAt: now,
                updatedAt: now,
              })
              .where(eq(tables.apiKeys.id, apiKeyRecord.id))
              .run()
          }
          
          const user = db
            .select({
              id: tables.users.id,
              username: tables.users.username,
              email: tables.users.email,
              role: tables.users.role,
              rootAdmin: tables.users.rootAdmin,
            })
            .from(tables.users)
            .where(eq(tables.users.id, session.user.id))
            .get()
          
          if (user) {
            const mockSession = {
              user: {
                id: user.id,
                username: user.username || null,
                email: user.email || null,
                role: ((user.rootAdmin || user.role === 'admin') ? 'admin' : 'user') as 'admin' | 'user',
                name: null,
                image: null,
                permissions: [],
                remember: null,
                passwordResetRequired: false,
              },
              session: {
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
            }
            
            const apiKeyUser = {
              id: user.id,
              username: user.username || '',
              role: ((user.rootAdmin || user.role === 'admin') ? 'admin' : 'user') as 'admin' | 'user',
              permissions: [],
              email: user.email || null,
              name: null,
              image: null,
              remember: null,
              passwordResetRequired: false,
            }
            
            const apiKeyPermissions = apiKeyRecord ? {
              id: apiKeyRecord.id,
              keyType: apiKeyRecord.keyType,
              permissions: {
                rServers: apiKeyRecord.rServers ?? 0,
                rNodes: apiKeyRecord.rNodes ?? 0,
                rAllocations: apiKeyRecord.rAllocations ?? 0,
                rUsers: apiKeyRecord.rUsers ?? 0,
                rLocations: apiKeyRecord.rLocations ?? 0,
                rNests: apiKeyRecord.rNests ?? 0,
                rEggs: apiKeyRecord.rEggs ?? 0,
                rDatabaseHosts: apiKeyRecord.rDatabaseHosts ?? 0,
                rServerDatabases: apiKeyRecord.rServerDatabases ?? 0,
              },
            } : null
            
            ;(event.context as { auth?: AuthContext & { apiKey?: typeof apiKeyPermissions } }).auth = {
              session: mockSession as unknown as typeof session,
              user: apiKeyUser,
              apiKey: apiKeyPermissions,
            }
            return
          }
        }
      } catch (error) {
        console.error('API key verification failed:', error)
      }
    }
  }

  const session = await getServerSession(event)

  if (!session?.user?.id) {
    if (isApiRequest) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: 'Authentication required.',
      })
    }

    return redirectToLogin(event, requestUrl)
  }

  let user
  try {
    user = requireSessionUser(session)
  } catch (error) {
    if (isApiRequest) {
      throw error
    }
    return redirectToLogin(event, requestUrl)
  }

  if (path.startsWith('/admin') && user.role !== 'admin') {
    if (isApiRequest) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'Administrator privileges required.',
      })
    }

    return sendRedirect(event, '/', 302)
  }

  if (user.passwordResetRequired && !path.startsWith('/auth/password/force')) {
    if (isApiRequest) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'Password reset required.',
      })
    }

    const searchParams = new URLSearchParams()
    if (!path.startsWith('/auth/')) {
      searchParams.set('redirect', requestUrl)
    }

    const redirectTarget = searchParams.size > 0
      ? `/auth/password/force?${searchParams.toString()}`
      : '/auth/password/force'

    return sendRedirect(event, redirectTarget, 302)
  }

  ;(event.context as { auth?: AuthContext }).auth = {
    session,
    user,
  }
})
