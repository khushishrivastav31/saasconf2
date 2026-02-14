import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';

test.describe('Dashboard', () => {
  test('should render dashboard with welcome greeting', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();
    await expect(dashboard.welcomeText).toBeVisible();
  });

  test('should show dashboard navigation cards', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();

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
