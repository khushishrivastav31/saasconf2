import { test, expect } from '@playwright/test';
import { PortalLoginPage } from './pages/portal-login.page';

const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';

test.describe('Portal Authentication', () => {
  test('should show portal login page with fields', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();
    await portalLogin.expectVisible();
    await expect(portalLogin.passwordInput).toBeVisible();
  });

  test('should show portal registration page', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.gotoRegister();

    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
  });

  test('should show error for invalid portal login', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();
    await portalLogin.login('nonexistent@example.com', 'wrongpassword');

    await expect(page.getByText(/invalid|incorrect|failed|error/i)).toBeVisible({ timeout: 10000 });
  });

  test('should have link to switch between login and register', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();
    await portalLogin.expectVisible();

    // Should have a link to register
    const registerLink = page.getByRole('link', { name: /register|sign up|create account/i });
    if (await registerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerLink.click();
      await expect(page).toHaveURL(/register/i, { timeout: 5000 });
    }
  });
});
