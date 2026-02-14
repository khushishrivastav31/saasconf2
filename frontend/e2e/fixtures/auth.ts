import { Page, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ADMIN_STORAGE_STATE = path.join(__dirname, '../../playwright/.auth/admin.json');
export const PORTAL_STORAGE_STATE = path.join(__dirname, '../../playwright/.auth/portal.json');

/**
 * Perform admin login via the UI and save storage state.
 */
export async function adminLogin(page: Page) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD required');

  await page.goto('/login');
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/dashboard|conferences/i, { timeout: 15000 });
  await page.waitForFunction(() => !!localStorage.getItem('access_token'), { timeout: 10000 });
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
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

  await expect(page).toHaveURL(/portal\/dashboard/i, { timeout: 15000 });
  await page.waitForFunction(() => !!localStorage.getItem('applicant_access_token'), { timeout: 10000 });
  await page.context().storageState({ path: PORTAL_STORAGE_STATE });
}
