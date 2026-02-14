import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { PortalLoginPage } from './pages/portal-login.page';

test.describe('Authentication', () => {
  test('should show admin login page with form elements', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('invalid@example.com', 'wrongpassword');
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    const protectedRoutes = ['/dashboard', '/modules/conferences', '/admin/tenants'];
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/login/i, { timeout: 5000 });
    }
  });

  test('should show portal login page', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();
    await expect(portalLogin.emailInput).toBeVisible({ timeout: 10000 });
  });

  test('should show portal registration form', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.gotoRegister();
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
  });
});
