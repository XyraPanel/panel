/// <reference types="@vite-pwa/nuxt" />

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
const enableHintsModule = process.env.NUXT_ENABLE_HINTS === 'true'

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
    '@vite-pwa/nuxt',
    ...(isDev ? ['@nuxt/test-utils/module'] : []), // Only include test utils in development
    ...(enableHintsModule ? ['@nuxt/hints'] : []),
    'nuxt-charts',
    '@nuxtjs/robots',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    'nuxt-monaco-editor',
    '@nuxtjs/turnstile',
    '@nuxt/scripts',
    '@nuxtjs/i18n',
  ],

  pwa: {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    manifest: {
      name: process.env.APP_NAME || 'XyraPanel',
      short_name: process.env.APP_NAME || 'XyraPanel',
      description: `${process.env.APP_NAME || 'XyraPanel'} - Server Management Dashboard`,
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: '/favicon.ico',
          sizes: '64x64 32x32 24x24 16x16',
          type: 'image/x-icon',
        },
      ],
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600,
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2}'],
      navigateFallback: '/',
      cleanupOutdatedCaches: true,
      maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
    },
  },

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
    recaptcha: {
      secretKey: process.env.NUXT_RECAPTCHA_SECRET_KEY || '',
      minScore: process.env.NUXT_RECAPTCHA_MIN_SCORE ? Number.parseFloat(process.env.NUXT_RECAPTCHA_MIN_SCORE) : 0.5,
    },
    hcaptcha: {
      secretKey: process.env.NUXT_HCAPTCHA_SECRET_KEY || '',
      siteKey: process.env.NUXT_HCAPTCHA_SITE_KEY || '',
    },
    debug: process.env.DEBUG === 'true',
    public: {
      appName: process.env.APP_NAME || 'XyraPanel',
      debug: process.env.DEBUG === 'true',
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
      headers: {
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: 'unsafe-none',
        crossOriginOpenerPolicy: 'unsafe-none',
        originAgentCluster: false,
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
    }
    : {
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
        originAgentCluster: false,
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubdomains: true,
          preload: true,
        },
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
    },

  app: {
    head: {
      title: process.env.APP_NAME || 'XyraPanel',
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },
  site: { 
    indexable: false, 
  },
  robots: {
    blockAiBots: true, // Block AI bots from crawling !
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
      {
        route: '/api/admin/servers/:id/limits',
        method: 'get',
        handler: './server/api/admin/servers/[id]/limits.get.ts',
      },
      {
        route: '/api/admin/servers/:id/startup',
        method: 'get',
        handler: './server/api/admin/servers/[id]/startup.get.ts',
      },
      {
        route: '/api/admin/servers/:id/startup',
        method: 'patch',
        handler: './server/api/admin/servers/[id]/startup.patch.ts',
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
        route: '/api/servers/:id',
        method: 'get',
        handler: './server/api/servers/[id]/index.get.ts',
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