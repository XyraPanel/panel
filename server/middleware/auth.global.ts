import { createError, defineEventHandler, sendRedirect } from 'h3'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
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

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!session || !user) {
    if (isApiRequest) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: 'Authentication required.',
      })
    }

    const hasAuthQuery = requestUrl.startsWith('/auth/login') || requestUrl.startsWith('/auth/error')
    const searchParams = new URLSearchParams()

    if (!hasAuthQuery && requestUrl !== '/auth/login') {
      searchParams.set('redirect', requestUrl)
    }

    const redirectTarget = searchParams.size > 0
      ? `/auth/login?${searchParams.toString()}`
      : '/auth/login'

    await sendRedirect(event, redirectTarget, 302)
    return
  }

  (event.context as { auth?: AuthContext }).auth = {
    session,
    user,
  }
})
