import { Page, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ADMIN_STORAGE_STATE = path.join(__dirname, '../../playwright/.auth/admin.json');
export const PORTAL_STORAGE_STATE = path.join(__dirname, '../../playwright/.auth/portal.json');

/**
 * Perform admin login via the UI and save storage state.
 */
export async function adminLogin(page: Page, retries = 3) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD required');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
      await page.getByPlaceholder(/email/i).fill(email);
      await page.getByPlaceholder(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in/i }).click();

      await expect(page).toHaveURL(/dashboard|conferences/i, { timeout: 30000 });
      await page.waitForFunction(() => !!localStorage.getItem('access_token'), { timeout: 15000 });
      await page.context().storageState({ path: ADMIN_STORAGE_STATE });
      return; // success
    } catch (err) {
      if (attempt === retries) throw err;
      // Wait before retry — backend may still be starting after deploy
      await page.waitForTimeout(5000);
    }
  }
}

/**
 * Perform portal applicant login via the UI and save storage state.
 */
export async function portalLogin(page: Page) {
  const email = process.env.E2E_PORTAL_EMAIL;
  const password = process.env.E2E_PORTAL_PASSWORD;
  const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';
  if (!email || !password) throw new Error('E2E_PORTAL_EMAIL and E2E_PORTAL_PASSWORD required');

  await page.goto(`/${tenantSlug}/portal/user/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // LoginPage routes the user to ``/portal/news`` by default, or
  // ``/portal/trainings`` for training-only accounts (see
  // frontend/src/pages/portal/LoginPage.tsx:61-65). The previous
  // ``/portal/dashboard`` assertion was stale — the dashboard route still
  // exists but isn't where the login lands. The localStorage check below
  // is the real success signal; this URL match just ensures we're past
  // ``/user/login``.
  await expect(page).toHaveURL(/portal\/(news|dashboard|trainings)/i, { timeout: 15000 });
  await page.waitForFunction(() => !!localStorage.getItem('applicant_access_token'), { timeout: 10000 });
  await page.context().storageState({ path: PORTAL_STORAGE_STATE });
}
