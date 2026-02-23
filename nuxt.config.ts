/// <reference types="@vite-pwa/nuxt" />

const isDev = process.env.NODE_ENV !== 'production';

const redisStorageConfig = {
  host: process.env.REDIS_HOST || (isDev ? 'localhost' : 'redis'),
  port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT) : 6379,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true',
};

const redisRateLimiterOptions = {
  host: process.env.REDIS_HOST || (isDev ? 'localhost' : 'redis'),
  port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT) : 6379,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
};

const authOrigin =
  process.env.BETTER_AUTH_URL ||
  process.env.AUTH_ORIGIN ||
  process.env.NUXT_AUTH_ORIGIN ||
  process.env.NUXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3000';

const appOrigin = process.env.NUXT_SECURITY_CORS_ORIGIN || authOrigin;

const allowedOrigins = process.env.NUXT_SECURITY_CORS_ORIGIN
  ? process.env.NUXT_SECURITY_CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : appOrigin === 'http://localhost:3000'
    ? ['*'] // Dev - allow all
    : [appOrigin]; // Production - only allow configured origin (no localhost)

const extraConnectSources = process.env.NUXT_SECURITY_CONNECT_SRC
  ? process.env.NUXT_SECURITY_CONNECT_SRC.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  : [];

const connectSrcDirectives = ["'self'", 'https:', 'wss:', 'ws:', ...extraConnectSources];
const enableCspReportOnly = process.env.NUXT_SECURITY_CSP_REPORT_ONLY === 'true';
const cspReportUri = process.env.NUXT_SECURITY_CSP_REPORT_URI?.trim() || null;
const hasRedisRateLimitConfig = Boolean(process.env.REDIS_HOST && process.env.REDIS_PORT);
const preferredRateLimiterDriver = (
  process.env.NUXT_SECURITY_RATE_LIMIT_DRIVER || 'lruCache'
).trim();
const shouldUseRedisRateLimiter =
  !isDev && preferredRateLimiterDriver === 'redis' && hasRedisRateLimitConfig;

const globalRateLimiterDriver = shouldUseRedisRateLimiter
  ? ({
      name: 'redis',
      options: redisRateLimiterOptions,
    } as const)
  : ({
      name: 'lruCache',
    } as const);

const globalRateLimiterTokens = process.env.NUXT_SECURITY_RATE_LIMIT_TOKENS
  ? Number.parseInt(process.env.NUXT_SECURITY_RATE_LIMIT_TOKENS, 10)
  : 150;

const globalRateLimiterInterval = process.env.NUXT_SECURITY_RATE_LIMIT_INTERVAL_MS
  ? Number.parseInt(process.env.NUXT_SECURITY_RATE_LIMIT_INTERVAL_MS, 10)
  : 300000;

const maxRequestSize = process.env.NUXT_MAX_REQUEST_SIZE_MB
  ? Number.parseInt(process.env.NUXT_MAX_REQUEST_SIZE_MB) * 1024 * 1024
  : 4 * 1024 * 1024;

const maxUploadSize = process.env.NUXT_MAX_UPLOAD_SIZE_MB
  ? Number.parseInt(process.env.NUXT_MAX_UPLOAD_SIZE_MB) * 1024 * 1024
  : 20 * 1024 * 1024;

export default defineNuxtConfig({
  compatibilityDate: '2026-02-12',
  devtools: {
    enabled: true,
  },
  css: ['~/assets/css/main.css'],
  modules: [
    '@nuxt/ui',
    'nuxt-qrcode',
    'nuxt-security',
    '@vite-pwa/nuxt',
    'nuxt-charts',
    '@nuxtjs/robots',
    '@pinia/nuxt',
    'nuxt-monaco-editor',
    '@nuxtjs/turnstile',
    '@nuxt/scripts',
    '@nuxtjs/i18n',
    '@nuxt/a11y',
    '@nuxt/hints',
  ],
  vite: {
    ssr: {
      noExternal: ['drizzle-orm'],
    },
  },
  routeRules: {
    '/admin/**': {
      appLayout: 'admin',
    },
    '/auth/**': {
      appLayout: 'auth',
    },
    '/server': {
      appLayout: 'default',
    },
    '/server/**': {
      appLayout: 'server',
    },
    '/api/auth/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 45,
          interval: 300000,
          throwError: true,
        },
      },
    },
    '/api/auth/sign-in/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 5,
          interval: 600000,
          throwError: true,
        },
      },
    },
    '/api/auth/forget-password': {
      security: {
        rateLimiter: {
          tokensPerInterval: 5,
          interval: 900000,
          throwError: true,
        },
      },
    },
    '/api/auth/reset-password': {
      security: {
        rateLimiter: {
          tokensPerInterval: 8,
          interval: 900000,
          throwError: true,
        },
      },
    },
    '/api/auth/password/request': {
      security: {
        rateLimiter: {
          tokensPerInterval: 5,
          interval: 900000,
          throwError: true,
        },
      },
    },
    '/api/auth/password/reset': {
      security: {
        rateLimiter: {
          tokensPerInterval: 8,
          interval: 900000,
          throwError: true,
        },
      },
    },
    '/api/user/2fa/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 8,
          interval: 300000,
          throwError: true,
        },
      },
    },
    '/api/account/password/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 8,
          interval: 300000,
          throwError: true,
        },
      },
    },
    '/api/account/email': {
      security: {
        rateLimiter: {
          tokensPerInterval: 8,
          interval: 300000,
          throwError: true,
        },
      },
    },
    '/api/account/sessions/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 15,
          interval: 300000,
          throwError: true,
        },
      },
    },
    '/api/account/api-keys/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 20,
          interval: 300000,
          throwError: true,
        },
      },
    },
    '/api/admin/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 300,
          interval: 60000,
          throwError: true,
        },
      },
    },
    '/api/wings/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 300,
          interval: 60000,
          throwError: true,
        },
      },
    },
    '/api/servers/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 300,
          interval: 60000,
          throwError: true,
        },
      },
    },
    '/api/client/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 300,
          interval: 60000,
          throwError: true,
        },
      },
    },
    '/api/admin/eggs/import': {
      security: {
        requestSizeLimiter: false,
        xssValidator: false,
      },
    },
    '/api/remote/**': {
      security: {
        xssValidator: false,
      },
    },
    '/api/admin/eggs/**': {
      security: {
        xssValidator: false,
      },
    },
    '/api/admin/servers/**': {
      security: {
        xssValidator: false,
      },
    },
    '/api/client/servers/**': {
      security: {
        xssValidator: false,
      },
    },
  },

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
        {
          src: '/pwa-64x64.png',
          sizes: '64x64',
          type: 'image/png',
        },
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: '/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/apple-touch-icon-180x180.png',
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600,
    },
    workbox: {
      globPatterns: ['**/*.{js,css,png,svg,ico,woff,woff2}'],
      navigateFallback: null,
      navigateFallbackDenylist: [/.*/],
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

  ...(process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY
    ? {
        turnstile: {
          siteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY,
        },
      }
    : {}),

  runtimeConfig: {
    authOrigin,
    authSecret:
      process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NUXT_AUTH_SECRET,
    redis: redisStorageConfig,
    turnstile: {
      secretKey: process.env.NUXT_TURNSTILE_SECRET_KEY || '',
    },
    recaptcha: {
      secretKey: process.env.NUXT_RECAPTCHA_SECRET_KEY || '',
      minScore: process.env.NUXT_RECAPTCHA_MIN_SCORE
        ? Number.parseFloat(process.env.NUXT_RECAPTCHA_MIN_SCORE)
        : 0.5,
    },
    hcaptcha: {
      secretKey: process.env.NUXT_HCAPTCHA_SECRET_KEY || '',
      siteKey: process.env.NUXT_HCAPTCHA_SITE_KEY || '',
    },
    debug: process.env.DEBUG === 'true',
    httpCache: {
      enabled: process.env.NUXT_HTTP_CACHE_ENABLED !== 'false',
      defaultMaxAge: process.env.NUXT_HTTP_CACHE_DEFAULT_MAX_AGE
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_DEFAULT_MAX_AGE)
        : 5,
      defaultSwr: process.env.NUXT_HTTP_CACHE_DEFAULT_SWR
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_DEFAULT_SWR)
        : 15,
      dashboardMaxAge: process.env.NUXT_HTTP_CACHE_DASHBOARD_MAX_AGE
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_DASHBOARD_MAX_AGE)
        : 10,
      dashboardSwr: process.env.NUXT_HTTP_CACHE_DASHBOARD_SWR
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_DASHBOARD_SWR)
        : 30,
      adminDashboardMaxAge: process.env.NUXT_HTTP_CACHE_ADMIN_DASHBOARD_MAX_AGE
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_ADMIN_DASHBOARD_MAX_AGE)
        : 10,
      adminDashboardSwr: process.env.NUXT_HTTP_CACHE_ADMIN_DASHBOARD_SWR
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_ADMIN_DASHBOARD_SWR)
        : 30,
      adminNodeMaxAge: process.env.NUXT_HTTP_CACHE_ADMIN_NODE_MAX_AGE
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_ADMIN_NODE_MAX_AGE)
        : 5,
      adminNodeSwr: process.env.NUXT_HTTP_CACHE_ADMIN_NODE_SWR
        ? Number.parseInt(process.env.NUXT_HTTP_CACHE_ADMIN_NODE_SWR)
        : 15,
    },
    public: {
      appName: process.env.APP_NAME || 'XyraPanel',
      debug: process.env.DEBUG === 'true',
      panel: {
        baseUrl:
          process.env.NUXT_PUBLIC_PANEL_BASE_URL ||
          process.env.NUXT_PUBLIC_APP_URL ||
          process.env.APP_URL ||
          'http://localhost:3000',
      },
      turnstile: {
        siteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || '',
      },
      i18n: {
        baseUrl:
          process.env.NUXT_PUBLIC_I18N_BASE_URL ||
          appOrigin ||
          authOrigin ||
          'http://localhost:3000',
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
          ...(enableCspReportOnly
            ? {
                contentSecurityPolicyReportOnly: {
                  'default-src': ["'self'"],
                  'connect-src': connectSrcDirectives,
                  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
                  'style-src': ["'self'", 'https:', "'unsafe-inline'"],
                  'font-src': ["'self'", 'https:', 'data:'],
                  'script-src': ["'strict-dynamic'", "'nonce-{{nonce}}'", "'self'", 'https:'],
                  'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
                  'object-src': ["'none'"],
                  'base-uri': ["'self'"],
                  'form-action': ["'self'"],
                  'frame-ancestors': ["'none'"],
                  ...(cspReportUri ? { 'report-uri': [cspReportUri] } : {}),
                  'upgrade-insecure-requests': true,
                },
                contentSecurityPolicy: false,
              }
            : {
                contentSecurityPolicy: {
                  'default-src': ["'self'"],
                  'connect-src': connectSrcDirectives,
                  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
                  'style-src': ["'self'", 'https:', "'unsafe-inline'"],
                  'font-src': ["'self'", 'https:', 'data:'],
                  'script-src': ["'strict-dynamic'", "'nonce-{{nonce}}'", "'self'", 'https:'],
                  'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
                  'object-src': ["'none'"],
                  'base-uri': ["'self'"],
                  'form-action': ["'self'"],
                  'frame-ancestors': ["'none'"],
                  ...(cspReportUri ? { 'report-uri': [cspReportUri] } : {}),
                  'upgrade-insecure-requests': true,
                },
              }),
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
          tokensPerInterval: globalRateLimiterTokens,
          interval: globalRateLimiterInterval,
          headers: true,
          driver: globalRateLimiterDriver,
        },
        nonce: true,
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
  experimental: {
    buildCache: true,
  },
  nitro: {
    preset: 'node-server',
    externals: {
      inline: ['drizzle-orm'],
    },
    serverAssets: [
      {
        baseName: 'migrations',
        dir: './server/database/migrations',
      },
    ],
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
        route: '/api/admin/servers/:id/startup',
        method: 'get',
        handler: './server/api/admin/servers/[id]/startup/index.get.ts',
      },
      {
        route: '/api/admin/servers/:id/startup',
        method: 'patch',
        handler: './server/api/admin/servers/[id]/startup/index.patch.ts',
      },
      {
        route: '/api/admin/servers/:id/actions',
        method: 'post',
        handler: './server/api/admin/servers/[id]/actions.post.ts',
      },
      {
        route: '/api/admin/servers/:id/power',
        method: 'post',
        handler: './server/api/admin/servers/[id]/power.post.ts',
      },
      {
        route: '/api/admin/servers/:id/suspend',
        method: 'post',
        handler: './server/api/admin/servers/[id]/suspend.post.ts',
      },
      {
        route: '/api/admin/servers/:id/unsuspend',
        method: 'post',
        handler: './server/api/admin/servers/[id]/unsuspend.post.ts',
      },
      {
        route: '/api/admin/servers/:id/reinstall',
        method: 'post',
        handler: './server/api/admin/servers/[id]/reinstall.post.ts',
      },
      {
        route: '/api/admin/servers/:id/change-egg',
        method: 'post',
        handler: './server/api/admin/servers/[id]/change-egg.post.ts',
      },
      {
        route: '/api/admin/servers/:id/sync',
        method: 'post',
        handler: './server/api/admin/servers/[id]/sync.post.ts',
      },
      {
        route: '/api/admin/servers/:id/delete-from-wings',
        method: 'post',
        handler: './server/api/admin/servers/[id]/delete-from-wings.post.ts',
      },
    ],
    scheduledTasks: {
      '* * * * *': ['scheduler:process'],
      '*/2 * * * *': ['monitoring:collect-resources'],
      '0 * * * *': ['maintenance:prune-rate-limits'],
      '0 2 * * *': [
        'maintenance:prune-audit-logs',
        'maintenance:prune-sessions',
        'maintenance:prune-tokens',
        'maintenance:prune-backups',
      ],
      '0 3 * * 0': ['maintenance:prune-transfers'],
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
});
