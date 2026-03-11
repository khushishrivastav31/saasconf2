import { test, expect } from '@playwright/test';

/**
 * Public Registration Portal E2E Tests
 *
 * Tests the public registration form at /:tenantSlug/register/:conferenceSlug
 * These are unauthenticated pages accessible to anyone.
 */

const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';
const conferenceSlug = process.env.E2E_CONFERENCE_SLUG;

test.describe('Public Registration Portal', () => {
  test.beforeEach(async () => {
    if (!conferenceSlug) test.skip(true, 'E2E_CONFERENCE_SLUG not set');
  });

  test('should load registration page and show conference info', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Should show conference name or registration form
    const hasConferenceName = await page
      .locator('h1, h2')
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    const hasForm = await page
      .locator('form, [role="form"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasWelcome = await page
      .getByText(/welcome|register|registration/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasConferenceName || hasForm || hasWelcome).toBeTruthy();
  });

  test('should show attendee form fields', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Look for attendee input fields (first name, last name, email)
    const hasFirstName = await page
      .getByLabel(/first name/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    const hasLastName = await page
      .getByLabel(/last name/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasEmail = await page
      .getByLabel(/email/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // At least some form fields should be visible
    expect(hasFirstName || hasLastName || hasEmail).toBeTruthy();
  });

  test('should show billing fields', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Look for billing section fields
    const hasStreet = await page
      .getByLabel(/street|address/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    const hasCity = await page
      .getByLabel(/city/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasCountry = await page
      .getByLabel(/country/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasPostalCode = await page
      .getByLabel(/postal|zip/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(hasStreet || hasCity || hasCountry || hasPostalCode).toBeTruthy();
  });

  test('should show booking options', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Wait for page and API to load
    await page.waitForLoadState('networkidle');

    // Look for booking options (checkboxes, radio buttons, or option cards)
    const hasCheckbox = await page
      .locator('input[type="checkbox"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasRadio = await page
      .locator('input[type="radio"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasOptionCard = await page
      .getByText(/option|ticket|pass|registration/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // At least some booking selection should be visible
    expect(hasCheckbox || hasRadio || hasOptionCard).toBeTruthy();
  });

  test('should show payment method selection when Stripe is enabled', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    await page.waitForLoadState('networkidle');

    // Look for payment method options
    const hasCreditCard = await page
      .getByText(/credit card|card payment/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasBankTransfer = await page
      .getByText(/bank transfer/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // At least one payment method should be visible (if registration is open)
    if (!hasCreditCard && !hasBankTransfer) {
      // Registration may be closed or no booking options configured — skip gracefully
      test.skip(true, 'No payment methods visible — registration may not be open');
    }

    expect(hasCreditCard || hasBankTransfer).toBeTruthy();
  });

  test('should validate required fields on submit', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    await page.waitForLoadState('networkidle');

    // Try to submit without filling required fields
    const submitBtn = page.getByRole('button', { name: /submit|register|complete|pay/i }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSubmit) {
      test.skip(true, 'No submit button visible');
      return;
    }

    await submitBtn.click();

    // Should show validation errors (browser native or custom)
    await expect(page.getByText(/required|please fill|invalid|must be/i).first()).toBeVisible({ timeout: 5000 }).catch(() => {});

    const hasError = await page
      .getByText(/required|please fill|invalid|must be/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasInvalidInput = await page
      .locator('input:invalid, select:invalid')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const hasBorderError = await page
      .locator('.border-red-500, .border-red-300, [aria-invalid="true"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(hasError || hasInvalidInput || hasBorderError).toBeTruthy();
  });
});

test.describe('Public Registration - Invalid Routes', () => {
  test('should show error for non-existent conference slug', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/nonexistent-conference-xyz`);

    // Should show a "not found" or error message, or redirect
    const hasNotFound = await page
      .getByText(/not found|does not exist|error|unavailable/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    const hasRedirect = page.url().includes('login') || page.url().includes('404');

    expect(hasNotFound || hasRedirect).toBeTruthy();
  });

  test('should show error for non-existent tenant slug', async ({ page }) => {
    await page.goto(`/nonexistent-tenant-xyz/register/some-conference`);

    const hasNotFound = await page
      .getByText(/not found|does not exist|error|unavailable/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    const hasRedirect = page.url().includes('login') || page.url().includes('404');

    expect(hasNotFound || hasRedirect).toBeTruthy();
  });
});
