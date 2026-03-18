import { test, expect } from '@playwright/test';

/**
 * Re-authenticate if the storage state token has expired.
 * In CI with workers:1, tests run sequentially and the JWT access token
 * saved during admin-setup may expire before later tests execute.
 */
async function ensureAuthenticated(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // If we got redirected to login, the JWT token expired — re-authenticate
  if (page.url().includes('/login')) {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!email || !password) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD required');

    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/dashboard|conferences/i, { timeout: 15000 });
  }
}

test.describe('Dashboard', () => {
  test('should render dashboard with welcome greeting', async ({ page }) => {
    await ensureAuthenticated(page);
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 15000 });
  });

  test('should show dashboard page content', async ({ page }) => {
    await ensureAuthenticated(page);
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Dashboard should render main content area
    await expect(page.locator('main, [role="main"], h1, h2').first()).toBeVisible({ timeout: 15000 });
  });

  test('should navigate to Conferences from sidebar', async ({ page }) => {
    await ensureAuthenticated(page);
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 15000 });
    const conferencesLink = page.getByRole('link', { name: /conferences/i });
    await conferencesLink.click({ timeout: 15000 });
    await expect(page).toHaveURL(/conferences/i, { timeout: 15000 });
  });
});
