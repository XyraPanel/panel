/// <reference types="nuxt-csurf" />

const redisStorageConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT) : 6379,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true',
}

const authOrigin = process.env.AUTH_ORIGIN
  || process.env.NUXT_AUTH_ORIGIN
  || 'http://localhost:3000'

const authBaseUrl = `${authOrigin.replace(/\/$/, '')}/api/auth`

const appOrigin = process.env.NUXT_SECURITY_CORS_ORIGIN
  || authOrigin

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
    '@sidebase/nuxt-auth',
    'nuxt-security',
    '@nuxt/test-utils/module',
    '@nuxt/hints',
    'nuxt-charts',
    '@vite-pwa/nuxt',
    '@nuxtjs/robots',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
  ],

  auth: {
    origin: authOrigin,
    originEnvKey: 'AUTH_ORIGIN',
    baseURL: authBaseUrl,
    disableInternalRouting: true,
    provider: {
      type: 'authjs',
      trustHost: isDev,
      defaultProvider: 'credentials',
      addDefaultCallbackUrl: false,
      pages: {
        signIn: '/auth/login',
      },
    },
    sessionRefresh: {
      enablePeriodically: true,
      enableOnWindowFocus: true,
    },
    globalAppMiddleware: {
      isEnabled: true,
      allow404WithoutAuth: true,
      addDefaultCallbackUrl: false,
    },
  },

  runtimeConfig: {
    authOrigin,
    authSecret: process.env.NUXT_AUTH_SECRET,
    redis: redisStorageConfig,
    public: {
      appName: process.env.NUXT_APP_NAME
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
        permissionsPolicy: {
          camera: [],
          'display-capture': [],
          fullscreen: [],
          geolocation: [],
          microphone: [],
        },
      },
      corsHandler: {
        origin: '*',
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
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
        },
      },
      corsHandler: {
        origin: appOrigin,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
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
    },

  app: {
    head: {
      title: process.env.NUXT_APP_NAME,
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },
  site: { indexable: false },
  robots: {
    blockAiBots: true,
  },
  nitro: {
    preset: 'node-server',
    experimental: {
      tasks: true,
      websocket: true,
    },
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