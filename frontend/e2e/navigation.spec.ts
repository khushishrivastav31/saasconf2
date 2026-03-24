import { test, expect } from '@playwright/test';

import { softVisible } from './helpers/navigation';

/** Navigate to dashboard, re-authenticating if the saved session expired. */
async function gotoDashboard(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // If redirected to login, the stored auth state has expired — re-authenticate
  if (page.url().includes('/login')) {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!email || !password) throw new Error('E2E_ADMIN_EMAIL / PASSWORD required for re-auth');
    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/dashboard|conferences/i, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  }

  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 15000 });
}

test.describe('Navigation', () => {
  test('should show sidebar navigation with correct links', async ({ page }) => {
    await gotoDashboard(page);

    // Sidebar should have key navigation items
    const sidebar = page.locator('aside').or(page.locator('nav')).first();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('link', { name: /welcome/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /conferences/i })).toBeVisible();
  });

  test('should navigate to management or admin pages', async ({ page }) => {
    await gotoDashboard(page);

    // Admin section is only visible to super_admin; management is visible to tenant_admin+
    const companiesLink = page.getByRole('link', { name: /companies/i });
    const teamLink = page.getByRole('link', { name: /team/i });
    const hasAdmin = await softVisible(companiesLink, 3000);
    const hasManagement = await softVisible(teamLink, 3000);

    if (hasAdmin) {
      await companiesLink.click();
      await expect(page).toHaveURL(/tenants/i, { timeout: 5000 });
    } else if (hasManagement) {
      await teamLink.click();
      await expect(page).toHaveURL(/team/i, { timeout: 5000 });
    }
    // At least one management/admin section should exist for any logged-in user
    expect(hasAdmin || hasManagement).toBeTruthy();
  });

  test('should navigate between main sections', async ({ page }) => {
    await gotoDashboard(page);
    await page.goto('/modules/conferences');
    await expect(page.getByRole('heading', { name: /conferences/i })).toBeVisible({ timeout: 10000 });

    // Go back to welcome/dashboard
    const welcomeLink = page.getByRole('link', { name: /welcome/i });
    await welcomeLink.click();
    await expect(page).toHaveURL(/dashboard/i, { timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    await gotoDashboard(page);

    // Open user dropdown menu in header
    const userMenuTrigger = page.locator('header button:has(svg)').last();
    await userMenuTrigger.click();

    // Click the Logout button
    await page.getByRole('button', { name: /logout|sign out/i }).click();

    // Should redirect to login
    await expect(page).toHaveURL(/login/i, { timeout: 10000 });
  });
});
