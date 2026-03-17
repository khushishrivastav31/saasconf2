import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should render dashboard with welcome greeting', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 10000 });
  });

  test('should show dashboard page content', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

    // Dashboard should render main content area
    await expect(page.locator('main, [role="main"], h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Conferences from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const conferencesLink = page.getByRole('link', { name: /conferences/i });
    await conferencesLink.click();
    await expect(page).toHaveURL(/conferences/i, { timeout: 10000 });
  });
});
