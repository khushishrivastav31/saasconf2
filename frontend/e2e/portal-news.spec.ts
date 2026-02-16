import { test, expect } from '@playwright/test';
import { PortalDashboardPage } from './pages/portal-dashboard.page';

test.describe('Portal News', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_PORTAL_EMAIL || !process.env.E2E_PORTAL_PASSWORD) {
      test.skip();
    }
  });

  test('should navigate to News page from sidebar', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();

    // Click the News link in the sidebar navigation
    const sidebar = page.locator('aside, nav').first();
    await expect(sidebar).toBeVisible();

    const newsLink = page.getByRole('link', { name: /news/i }).first();
    await newsLink.click();

    const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';
    await expect(page).toHaveURL(new RegExp(`${tenantSlug}/portal/news`, 'i'), { timeout: 10000 });
  });

  test('should show news articles or empty state', async ({ page }) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';
    await page.goto(`/${tenantSlug}/portal/news`);

    // Should show news content area
    await expect(page.locator('main, [role="main"], .content').first()).toBeVisible({ timeout: 5000 });

    // Should show articles list or empty state
    const hasArticles = await page.getByText(/article|news|post|announcement/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no articles|no news|no posts|nothing here/i).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasArticles || hasEmpty).toBeTruthy();
  });

  test('should have News link visible in sidebar navigation', async ({ page }) => {
    const dashboard = new PortalDashboardPage(page);
    await dashboard.goto();
    await dashboard.expectVisible();

    // Verify the News link is present in the sidebar
    const sidebar = page.locator('aside, nav').first();
    await expect(sidebar).toBeVisible();

    const newsLink = sidebar.getByText(/news/i).first();
    await expect(newsLink).toBeVisible({ timeout: 5000 });
  });
});
