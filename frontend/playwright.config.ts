import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STORAGE = path.join(__dirname, 'playwright/.auth/admin.json');
const PORTAL_STORAGE = path.join(__dirname, 'playwright/.auth/portal.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',

  timeout: 60_000,

  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Auth setup projects (run first)
    {
      name: 'admin-setup',
      testMatch: /admin\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'portal-setup',
      testMatch: /portal\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Unauthenticated tests (no setup dependency)
    {
      name: 'unauth-tests',
      testMatch: '**/auth.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // Admin tests (depend on admin-setup)
    {
      name: 'admin-tests',
      testMatch: /^(?!.*portal)(?!.*auth\.spec)(?!.*\.setup\.).*\.spec\.ts$/,
      dependencies: ['admin-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE,
      },
    },

    // Portal tests (depend on portal-setup)
    {
      name: 'portal-tests',
      testMatch: /portal.*\.spec\.ts/,
      dependencies: ['portal-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: PORTAL_STORAGE,
      },
    },
  ],

  // Run local dev server before tests (only in local development)
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
