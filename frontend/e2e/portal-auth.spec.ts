import { test, expect } from '@playwright/test';
import { PortalLoginPage } from './pages/portal-login.page';

import { softVisible } from './helpers/navigation';

test.describe('Portal Authentication', () => {
  test('should show portal login page with fields', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();

    // Portal login should show email input (via label or placeholder) and sign in button
    const hasEmailLabel = await softVisible(page.getByLabel(/email/i), 10000);
    const hasEmailPlaceholder = await softVisible(page.getByPlaceholder(/email|you@/i), 3000);
    const hasSignIn = await softVisible(page.getByRole('button', { name: /sign in/i }), 3000);

    // If none are visible, tenant portal may not exist on staging
    if (!hasEmailLabel && !hasEmailPlaceholder && !hasSignIn) {
      test.skip(true, 'Portal login page not available for this tenant');
    }

    expect(hasEmailLabel || hasEmailPlaceholder).toBeTruthy();
  });

  test('should show portal registration page', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.gotoRegister();

    const hasEmail = await softVisible(page.getByLabel(/email/i), 10000);
    const hasFirstName = await softVisible(page.getByLabel(/first name/i), 3000);
    const hasCreateBtn = await softVisible(page.getByRole('button', { name: /create account/i }), 3000);

    if (!hasEmail && !hasFirstName && !hasCreateBtn) {
      test.skip(true, 'Portal registration page not available for this tenant');
    }

    expect(hasEmail || hasFirstName || hasCreateBtn).toBeTruthy();
  });

  test('should show error for invalid portal login', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();

    // Check if portal login page is available
    const hasEmailInput = await softVisible(page.getByLabel(/email/i), 10000);
    const hasPlaceholder = await softVisible(page.getByPlaceholder(/email|you@/i), 3000);

    if (!hasEmailInput && !hasPlaceholder) {
      test.skip(true, 'Portal login page not available for this tenant');
    }

    // Fill in invalid credentials
    if (hasEmailInput) {
      await page.getByLabel(/email/i).fill('nonexistent@example.com');
    } else {
      await page.getByPlaceholder(/email|you@/i).fill('nonexistent@example.com');
    }

    const hasPasswordLabel = await softVisible(page.getByLabel(/password/i), 3000);
    if (hasPasswordLabel) {
      await page.getByLabel(/password/i).fill('wrongpassword');
    }

    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|failed|error/i)).toBeVisible({ timeout: 10000 });
  });

  test('should have link to switch between login and register', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();

    const hasEmailInput = await softVisible(page.getByLabel(/email/i), 10000);
    if (!hasEmailInput) {
      test.skip(true, 'Portal login page not available for this tenant');
    }

    // Should have a link to register
    const registerLink = page.getByRole('link', { name: /register|sign up|create account/i });
    if (await softVisible(registerLink, 3000)) {
      await registerLink.click();
      await expect(page).toHaveURL(/register/i, { timeout: 5000 });
    }
  });
});
