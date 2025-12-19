const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || process.env.NITRO_PORT || 3000,
  HOST: process.env.HOST || process.env.NITRO_HOST || '0.0.0.0',
}

const env_production = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: process.env.PORT || process.env.NITRO_PORT || 3000,
  HOST: process.env.HOST || process.env.NITRO_HOST || '0.0.0.0',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || process.env.AUTH_ORIGIN || process.env.NUXT_PUBLIC_APP_URL || process.env.APP_URL,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_USERNAME: process.env.REDIS_USERNAME,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_TLS: process.env.REDIS_TLS,
  NUXT_SECURITY_CORS_ORIGIN: process.env.NUXT_SECURITY_CORS_ORIGIN,
  APP_NAME: process.env.APP_NAME,
  NUXT_MAX_REQUEST_SIZE_MB: process.env.NUXT_MAX_REQUEST_SIZE_MB,
  NUXT_MAX_UPLOAD_SIZE_MB: process.env.NUXT_MAX_UPLOAD_SIZE_MB,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
}

module.exports = {
  apps: [{
    name: 'xyrapanel',
    script: '.output/server/index.mjs',
    instances: 'max',
    exec_mode: 'cluster',
    env,
    env_production,
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
  }],
}
