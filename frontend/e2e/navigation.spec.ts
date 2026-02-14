import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should show sidebar navigation with correct links', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 10000 });

    // Sidebar should have key navigation items
    const sidebar = page.locator('aside').or(page.locator('nav')).first();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /conferences/i })).toBeVisible();
  });

  test('should navigate to admin pages', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 10000 });

    // Navigate to Companies (Tenants)
    const companiesLink = page.getByRole('link', { name: /companies/i });
    if (await companiesLink.isVisible()) {
      await companiesLink.click();
      await expect(page).toHaveURL(/tenants/i, { timeout: 5000 });
    }
  });

  test('should navigate between main sections', async ({ page }) => {
    await page.goto('/modules/conferences');
    await expect(page.getByRole('heading', { name: /conferences/i })).toBeVisible({ timeout: 10000 });

    // Go back to dashboard
    const dashboardLink = page.getByRole('link', { name: /dashboard/i });
    await dashboardLink.click();
    await expect(page).toHaveURL(/dashboard/i, { timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 10000 });

    // Open user dropdown menu in header
    const userMenuTrigger = page.locator('header button:has(svg)').last();
    await userMenuTrigger.click();

    // Click the Logout button
    await page.getByRole('button', { name: /logout|sign out/i }).click();

    // Should redirect to login
    await expect(page).toHaveURL(/login/i, { timeout: 10000 });
  });
});
