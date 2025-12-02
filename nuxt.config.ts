/// <reference types="nuxt-csurf" />

const redisStorageConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT) : 6379,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true',
}

const authOrigin = process.env.BETTER_AUTH_URL
  || process.env.AUTH_ORIGIN
  || process.env.NUXT_AUTH_ORIGIN
  || process.env.NUXT_PUBLIC_APP_URL
  || process.env.APP_URL
  || 'http://localhost:3000'

const appOrigin = process.env.NUXT_SECURITY_CORS_ORIGIN
  || authOrigin

const allowedOrigins = process.env.NUXT_SECURITY_CORS_ORIGIN
  ? process.env.NUXT_SECURITY_CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : appOrigin === 'http://localhost:3000'
    ? ['*'] // Dev - allow all
    : [appOrigin] // Production - only allow configured origin (no localhost)

const extraConnectSources = process.env.NUXT_SECURITY_CONNECT_SRC
  ? process.env.NUXT_SECURITY_CONNECT_SRC.split(',').map(entry => entry.trim()).filter(Boolean)
  : []

const connectSrcDirectives = ["'self'", 'https:', 'wss:', 'ws:', ...extraConnectSources]
const isDev = process.env.NODE_ENV !== 'production'

const maxRequestSize = process.env.NUXT_MAX_REQUEST_SIZE_MB
  ? Number.parseInt(process.env.NUXT_MAX_REQUEST_SIZE_MB) * 1024 * 1024
  : 4 * 1024 * 1024

const maxUploadSize = process.env.NUXT_MAX_UPLOAD_SIZE_MB
  ? Number.parseInt(process.env.NUXT_MAX_UPLOAD_SIZE_MB) * 1024 * 1024
  : 20 * 1024 * 1024

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  css: ['~/assets/css/main.css'],
  modules: [
    '@nuxt/ui',
    'nuxt-qrcode',
    '@nuxt/eslint',
    'nuxt-security',
    ...(isDev ? ['@nuxt/test-utils/module'] : []), // Only include test utils in development
    '@nuxt/hints',
    'nuxt-charts',
    '@nuxtjs/robots',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    'nuxt-monaco-editor',
    '@nuxtjs/turnstile',
    '@nuxt/scripts',
    '@nuxtjs/i18n',
  ],

  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    locales: [
      {
        code: 'en',
        name: 'English',
        language: 'en',
        dir: 'ltr',
        file: 'en.json',
      },
      // {
      //   code: 'es',
      //   name: 'Español',
      //   language: 'es',
      //   dir: 'ltr',
      //   file: 'es.json',
      // },
    ],
    restructureDir: 'i18n',
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
      fallbackLocale: 'en',
    },
    compilation: {
      strictMessage: true,
      escapeHtml: false,
    },
    bundle: {
      compositionOnly: true,
      runtimeOnly: false,
      fullInstall: true,
      dropMessageCompiler: false,
    },
    debug: isDev,
  },

  monacoEditor: {
    optimizeMonacoDeps: false,
    removeSourceMaps: true,
  },

  ...(process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY ? {
    turnstile: {
      siteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY,
    },
  } : {}),

  runtimeConfig: {
    authOrigin,
    authSecret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NUXT_AUTH_SECRET,
    redis: redisStorageConfig,
    turnstile: {
      secretKey: process.env.NUXT_TURNSTILE_SECRET_KEY || '',
    },
    debug: process.env.DEBUG === 'true' || process.env.NUXT_DEBUG === 'true' || isDev,
    public: {
      appName: process.env.NUXT_APP_NAME,
      debug: process.env.DEBUG === 'true' || process.env.NUXT_DEBUG === 'true' || isDev,
      turnstile: {
        siteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || '',
      },
      i18n: {
        baseUrl: process.env.NUXT_PUBLIC_I18N_BASE_URL || appOrigin || authOrigin || 'http://localhost:3000',
      },
    },
  },

  security: isDev
    ? {
      strict: false,
      headers: {
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: 'unsafe-none',
        crossOriginOpenerPolicy: 'unsafe-none',
        crossOriginResourcePolicy: 'same-origin',
      },
      corsHandler: {
        origin: '*',
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        credentials: true,
        preflight: { statusCode: 204 },
      },
      requestSizeLimiter: {
        maxRequestSizeInBytes: maxRequestSize,
        maxUploadFileRequestInBytes: maxUploadSize,
        throwError: true,
      },
      rateLimiter: false,
      csrf: false,
      nonce: true,
      hidePoweredBy: true,
      removeLoggers: true,
      basicAuth: false,
    }
    : {
      strict: false,
      headers: {
        contentSecurityPolicy: {
          'default-src': ["'self'"],
          'connect-src': connectSrcDirectives,
          'img-src': ["'self'", 'data:', 'https:', 'blob:'],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'font-src': ["'self'", 'https:', 'data:'],
          'script-src': ["'self'", "'unsafe-inline'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': true,
        },
        crossOriginEmbedderPolicy: 'unsafe-none',
        crossOriginOpenerPolicy: 'same-origin-allow-popups',
        crossOriginResourcePolicy: 'cross-origin',
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubdomains: true,
          preload: true,
        },
        xContentTypeOptions: 'nosniff',
        xFrameOptions: 'DENY',
        xXSSProtection: '1; mode=block',
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
      corsHandler: {
        origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        credentials: true,
        preflight: { statusCode: 204 },
      },
      requestSizeLimiter: {
        maxRequestSizeInBytes: maxRequestSize,
        maxUploadFileRequestInBytes: maxUploadSize,
        throwError: true,
      },
      rateLimiter: {
        tokensPerInterval: 150,
        interval: 'hour',
        headers: true,
        driver: {
          name: 'lruCache',
        },
      },
      csrf: false, // Handled by BetterAuth
      nonce: true,
      hidePoweredBy: true,
      removeLoggers: true,
      basicAuth: false,
    },

  app: {
    head: {
      title: process.env.NUXT_APP_NAME,
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
      meta: [
        // Remove Origin-Agent-Cluster header to fix the warning
        { 'http-equiv': 'Origin-Agent-Cluster', content: '?0' },
      ],
    },
  },
  site: { 
    indexable: false, 
  },
  robots: {
    blockAiBots: true, // Block AI bots from crawling !
  },
  routeRules: {
    '/api/**': { ssr: false },
    '/api/admin/servers/:id/build': {
      ssr: false,
      prerender: false,
    },
    '/api/servers/:id/files/write': {
      ssr: false,
      prerender: false,
    },
    '/api/servers/:id/files': {
      ssr: false,
      prerender: false,
    },
  },
  nitro: {
    preset: 'node-server',
    errorHandler: './server/error.ts',
    experimental: {
      tasks: true, // NOTE: The panel will remain in a BETA STATE until Nitro tasks are stable. See https://github.com/nuxt/nitro/issues/1105
      websocket: true,
    },
    handlers: [
      {
        route: '/api/admin/servers/:id/build',
        method: 'patch',
        handler: './server/api/admin/servers/[id]/build.patch.ts',
      },
      // CRITICAL: The files/write route MUST match exactly
      // The route file is at: server/api/servers/[id]/files/write.post.ts
      // This should auto-scan to: /api/servers/:id/files/write (POST)
      // But we explicitly register it to ensure it matches
      {
        route: '/api/servers/:id/files/write',
        method: 'post',
        handler: './server/api/servers/[id]/files/write.post.ts',
        lazy: true,
      },
      {
        route: '/api/servers/:id/files',
        method: 'get',
        handler: './server/api/servers/[id]/files.get.ts',
      },
    ],
    scheduledTasks: {
      // Run task every minute
      '* * * * *': ['scheduler:process'],
      // Run resource collection every 2 minutes
      '*/2 * * * *': ['monitoring:collect-resources']
    },
    storage: {
      cache: {
        driver: 'redis',
        ...redisStorageConfig,
      },
    },
    devStorage: {
      cache: {
        driver: 'fs',
        base: './.data/cache',
      },
    },
  },
})