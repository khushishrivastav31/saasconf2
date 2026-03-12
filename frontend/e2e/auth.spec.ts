import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { PortalLoginPage } from './pages/portal-login.page';

import { softVisible } from './helpers/navigation';
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
    const hasLabel = await softVisible(page.getByLabel(/email/i), 10000);
    const hasPlaceholder = await softVisible(page.getByPlaceholder(/email|you@/i), 5000);
    const hasSignIn = await softVisible(page.getByRole('button', { name: /sign in/i }), 5000);
    expect(hasLabel || hasPlaceholder || hasSignIn).toBeTruthy();
  });

  test('should show portal registration form', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.gotoRegister();
    // Registration should show form with name/email fields or create account button
    const hasEmail = await softVisible(page.getByLabel(/email/i), 10000);
    const hasFirstName = await softVisible(page.getByLabel(/first name/i), 5000);
    const hasCreateBtn = await softVisible(page.getByRole('button', { name: /create account/i }), 5000);
    expect(hasEmail || hasFirstName || hasCreateBtn).toBeTruthy();
  });
});
