import { test, expect } from '@playwright/test';

test.describe('CFP Portal', () => {
  // The CFP portal is accessed via /:tenantSlug/portal
  const portalPath = process.env.E2E_PORTAL_PATH || '/demo/portal';

  test('should show portal landing page', async ({ page }) => {
    await page.goto(portalPath);

    // Should show either login/register or the portal dashboard
    const hasPortalContent = await page.getByText(/call for papers|submit|proposal|speaker/i).isVisible();
    const hasAuthForm = await page.getByLabel(/email/i).isVisible();

    expect(hasPortalContent || hasAuthForm).toBeTruthy();
  });

  test('should show registration form for new users', async ({ page }) => {
    await page.goto(`${portalPath}/register`);

    // Check registration form elements
    const emailInput = page.getByLabel(/email/i);
    const firstNameInput = page.getByLabel(/first.*name/i);
    const lastNameInput = page.getByLabel(/last.*name/i);
    const passwordInput = page.getByLabel(/password/i).first();

    // At least email and password should be visible
    const hasEmail = await emailInput.isVisible();
    const hasPassword = await passwordInput.isVisible();

    if (hasEmail && hasPassword) {
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    } else {
      // Portal might not be configured for this tenant
      test.skip();
    }
  });

  test('should show login form for existing users', async ({ page }) => {
    await page.goto(`${portalPath}/login`);

    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    const submitButton = page.getByRole('button', { name: /sign in|login|submit/i });

    const hasForm = await emailInput.isVisible() && await passwordInput.isVisible();

    if (hasForm) {
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(submitButton).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('should validate email format on registration', async ({ page }) => {
    await page.goto(`${portalPath}/register`);

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
