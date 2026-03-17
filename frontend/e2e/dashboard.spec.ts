import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should render dashboard with welcome greeting', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 15000 });
  });

  test('should show dashboard page content', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Dashboard should render main content area
    await expect(page.locator('main, [role="main"], h1, h2').first()).toBeVisible({ timeout: 15000 });
  });

  test('should navigate to Conferences from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 15000 });
    const conferencesLink = page.getByRole('link', { name: /conferences/i });
    await conferencesLink.click({ timeout: 15000 });
    await expect(page).toHaveURL(/conferences/i, { timeout: 15000 });
  });
});
