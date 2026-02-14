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
    // Portal login should show a form with email input or placeholder
    const hasLabel = await page.getByLabel(/email/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasPlaceholder = await page.getByPlaceholder(/email|you@/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasSignIn = await page.getByRole('button', { name: /sign in/i }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasLabel || hasPlaceholder || hasSignIn).toBeTruthy();
  });

  test('should show portal registration form', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.gotoRegister();
    // Registration should show form with name/email fields or create account button
    const hasEmail = await page.getByLabel(/email/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasFirstName = await page.getByLabel(/first name/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasCreateBtn = await page.getByRole('button', { name: /create account/i }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasEmail || hasFirstName || hasCreateBtn).toBeTruthy();
  });
});
