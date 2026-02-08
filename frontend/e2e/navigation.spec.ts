import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Should either show login or redirect to login for unauthenticated users
    await expect(page).toHaveURL(/login|\/$/);
  });

  test('should have working navigation after login', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;

    if (!email || !password) {
      test.skip();
      return;
    }

    // Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for dashboard
    await page.waitForURL(/dashboard|conferences/i, { timeout: 10000 });

    // Check that main navigation elements are present
    const nav = page.locator('nav, [role="navigation"], aside');
    await expect(nav.first()).toBeVisible();

    // Try to navigate to different sections
    const links = [
      { pattern: /conferences/i, url: /conferences/i },
      { pattern: /settings/i, url: /settings/i },
    ];

    for (const link of links) {
      const navLink = page.getByRole('link', { name: link.pattern });
      if (await navLink.isVisible()) {
        await navLink.click();
        await expect(page).toHaveURL(link.url, { timeout: 5000 });
      }
    }
  });

  test('should protect routes from unauthenticated access', async ({ page }) => {
    // Try to access protected routes
    const protectedRoutes = ['/conferences', '/settings', '/dashboard'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      // Should redirect to login
      await expect(page).toHaveURL(/login/i, { timeout: 5000 });
    }
  });
});
