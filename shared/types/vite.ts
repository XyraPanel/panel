import type { VitePWAOptions } from 'vite-plugin-pwa'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    pwa?: VitePWAOptions
  }
}