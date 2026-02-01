import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/unit/**/*.{test,spec}.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.nuxt/', 'test/', '**/*.config.*', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '#shared/*': fileURLToPath(new URL('./shared', import.meta.url)) + '/*',
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
      '#server/*': fileURLToPath(new URL('./server', import.meta.url)) + '/*',
    },
  },
});
