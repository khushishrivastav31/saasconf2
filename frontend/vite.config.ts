/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3000,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'src/components/**/*.{ts,tsx}',
        'src/contexts/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/utils/**/*.{ts,tsx}',
        'src/config/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/test/**',
        'src/**/__tests__/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
      ],
      // Ratchet: merged CI coverage on 2026-07-10 was statements 63.55,
      // lines 64.18. Floors set just below to block regressions without
      // forcing a fresh round of test-writing. The audit target is 65 for
      // statements + lines (phases D/G close this gap).
      //
      // These two numbers are duplicated in the `coverage-report` job of
      // .github/workflows/ci.yml, which gates the MERGED number across shards
      // (this config only gates a single unsharded run). Bump both together.
      // Ratchet up only; never lower them.
      thresholds: {
        statements: 62,
        branches: 50,
        functions: 50,
        lines: 63,
      },
    },
  },
})
