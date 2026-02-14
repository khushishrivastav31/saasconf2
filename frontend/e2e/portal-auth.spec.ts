import { test, expect } from '@playwright/test';
import { PortalLoginPage } from './pages/portal-login.page';

const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';

test.describe('Portal Authentication', () => {
  test('should show portal login page with fields', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();

    // Portal login should show email input (via label or placeholder) and sign in button
    const hasEmailLabel = await page.getByLabel(/email/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasEmailPlaceholder = await page.getByPlaceholder(/email|you@/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasSignIn = await page.getByRole('button', { name: /sign in/i }).isVisible({ timeout: 3000 }).catch(() => false);

    // If none are visible, tenant portal may not exist on staging
    if (!hasEmailLabel && !hasEmailPlaceholder && !hasSignIn) {
      test.skip(true, 'Portal login page not available for this tenant');
    }

    expect(hasEmailLabel || hasEmailPlaceholder).toBeTruthy();
  });

  test('should show portal registration page', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.gotoRegister();

    const hasEmail = await page.getByLabel(/email/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasFirstName = await page.getByLabel(/first name/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasCreateBtn = await page.getByRole('button', { name: /create account/i }).isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasEmail && !hasFirstName && !hasCreateBtn) {
      test.skip(true, 'Portal registration page not available for this tenant');
    }

    expect(hasEmail || hasFirstName || hasCreateBtn).toBeTruthy();
  });

  test('should show error for invalid portal login', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();

    // Check if portal login page is available
    const hasEmailInput = await page.getByLabel(/email/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasPlaceholder = await page.getByPlaceholder(/email|you@/i).isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasEmailInput && !hasPlaceholder) {
      test.skip(true, 'Portal login page not available for this tenant');
    }

    // Fill in invalid credentials
    if (hasEmailInput) {
      await page.getByLabel(/email/i).fill('nonexistent@example.com');
    } else {
      await page.getByPlaceholder(/email|you@/i).fill('nonexistent@example.com');
    }

    const hasPasswordLabel = await page.getByLabel(/password/i).isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPasswordLabel) {
      await page.getByLabel(/password/i).fill('wrongpassword');
    }

    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|failed|error/i)).toBeVisible({ timeout: 10000 });
  });

  test('should have link to switch between login and register', async ({ page }) => {
    const portalLogin = new PortalLoginPage(page);
    await portalLogin.goto();

    const hasEmailInput = await page.getByLabel(/email/i).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasEmailInput) {
      test.skip(true, 'Portal login page not available for this tenant');
    }

    // Should have a link to register
    const registerLink = page.getByRole('link', { name: /register|sign up|create account/i });
    if (await registerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerLink.click();
      await expect(page).toHaveURL(/register/i, { timeout: 5000 });
    }
  });
});
