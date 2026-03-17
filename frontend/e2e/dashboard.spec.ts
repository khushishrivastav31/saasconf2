import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should render dashboard with welcome greeting', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show dashboard navigation cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

    // Dashboard should have clickable cards/links
    const links = page.getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate to Conferences from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const conferencesLink = page.getByRole('link', { name: /conferences/i });
    await conferencesLink.click();
    await expect(page).toHaveURL(/conferences/i, { timeout: 10000 });
  });
});
