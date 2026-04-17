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
      // Ratchet: measured values on 2026-04-17 were statements 60.68,
      // lines 61.25. Floors set just below to block regressions without
      // forcing a fresh round of test-writing in this PR. The audit target
      // is 65 for statements + lines (phases D/G close this gap).
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 50,
        lines: 61,
      },
    },
  },
})
