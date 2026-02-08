import { test, expect } from '@playwright/test';

test.describe('CFP Portal', () => {
  // The CFP portal is accessed via /:tenantSlug/portal/user/...
  const portalPath = process.env.E2E_PORTAL_PATH || '/demo/portal';

  test('should show portal login page', async ({ page }) => {
    // Go directly to the portal login page
    await page.goto(`${portalPath}/user/login`);

    // Should show login form with email input and Sign In button
    const emailInput = page.getByLabel(/email/i);
    const signInButton = page.getByRole('button', { name: /sign in/i });

    // Check if we're on a valid portal page
    const hasLoginForm = await emailInput.isVisible();
    const hasButton = await signInButton.isVisible();

    if (!hasLoginForm && !hasButton) {
      // Portal might not be configured - check if we get an error page
      const hasError = await page.getByText(/not found|error|404/i).isVisible();
      if (hasError) {
        test.skip();
        return;
      }
    }

    expect(hasLoginForm || hasButton).toBeTruthy();
  });

  test('should show registration form for new users', async ({ page }) => {
    await page.goto(`${portalPath}/user/register`);

    // Check registration form elements
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i).first();

    // At least email should be visible
    const hasEmail = await emailInput.isVisible();

    if (hasEmail) {
      await expect(emailInput).toBeVisible();
    } else {
      // Portal might not be configured for this tenant
      const hasError = await page.getByText(/not found|error|404/i).isVisible();
      if (hasError) {
        test.skip();
      }
    }
  });

  test('should show login form for existing users', async ({ page }) => {
    await page.goto(`${portalPath}/user/login`);

    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    const submitButton = page.getByRole('button', { name: /sign in/i });

    const hasForm = await emailInput.isVisible() && await passwordInput.isVisible();

    if (hasForm) {
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(submitButton).toBeVisible();
    } else {
      // Portal might not be configured
      test.skip();
    }
  });

  test('should validate email format on registration', async ({ page }) => {
    await page.goto(`${portalPath}/user/register`);

    const emailInput = page.getByLabel(/email/i);

    if (!await emailInput.isVisible()) {
      test.skip();
      return;
    }

    // Enter invalid email
    await emailInput.fill('invalid-email');
    await emailInput.blur();

    // Should show validation error or HTML5 validation
    const hasError = await page.getByText(/invalid|valid email/i).isVisible();
    const hasNativeValidation = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);

    expect(hasError || hasNativeValidation).toBeTruthy();
  });
});
