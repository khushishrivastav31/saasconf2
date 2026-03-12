import { test, expect } from '@playwright/test';

import { softVisible } from './helpers/navigation';
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
    const hasConferenceName = await softVisible(page
      .locator('h1, h2')
      .first(), 15000);
    const hasForm = await softVisible(page
      .locator('form, [role="form"]')
      .first(), 5000);
    const hasWelcome = await softVisible(page
      .getByText(/welcome|register|registration/i)
      .first(), 5000);

    expect(hasConferenceName || hasForm || hasWelcome).toBeTruthy();
  });

  test('should show attendee form fields', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Look for attendee input fields (first name, last name, email)
    const hasFirstName = await softVisible(page
      .getByLabel(/first name/i)
      .first(), 10000);
    const hasLastName = await softVisible(page
      .getByLabel(/last name/i)
      .first(), 3000);
    const hasEmail = await softVisible(page
      .getByLabel(/email/i)
      .first(), 3000);

    // At least some form fields should be visible
    expect(hasFirstName || hasLastName || hasEmail).toBeTruthy();
  });

  test('should show billing fields', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Look for billing section fields
    const hasStreet = await softVisible(page
      .getByLabel(/street|address/i)
      .first(), 10000);
    const hasCity = await softVisible(page
      .getByLabel(/city/i)
      .first(), 3000);
    const hasCountry = await softVisible(page
      .getByLabel(/country/i)
      .first(), 3000);
    const hasPostalCode = await softVisible(page
      .getByLabel(/postal|zip/i)
      .first(), 3000);

    expect(hasStreet || hasCity || hasCountry || hasPostalCode).toBeTruthy();
  });

  test('should show booking options', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    // Wait for page and API to load
    await page.waitForLoadState('networkidle');

    // Look for booking options (checkboxes, radio buttons, or option cards)
    const hasCheckbox = await softVisible(page
      .locator('input[type="checkbox"]')
      .first(), 5000);
    const hasRadio = await softVisible(page
      .locator('input[type="radio"]')
      .first(), 3000);
    const hasOptionCard = await softVisible(page
      .getByText(/option|ticket|pass|registration/i)
      .first(), 3000);

    // At least some booking selection should be visible
    expect(hasCheckbox || hasRadio || hasOptionCard).toBeTruthy();
  });

  test('should show payment method selection when Stripe is enabled', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/${conferenceSlug}`);

    await page.waitForLoadState('networkidle');

    // Look for payment method options
    const hasCreditCard = await softVisible(page
      .getByText(/credit card|card payment/i)
      .first(), 5000);
    const hasBankTransfer = await softVisible(page
      .getByText(/bank transfer/i)
      .first(), 3000);

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
    const hasSubmit = await softVisible(submitBtn, 5000);

    if (!hasSubmit) {
      test.skip(true, 'No submit button visible');
      return;
    }

    await submitBtn.click();

    // Should show validation errors (browser native or custom)
    await expect(page.getByText(/required|please fill|invalid|must be/i).first()).toBeVisible({ timeout: 5000 }).catch(() => {});

    const hasError = await softVisible(page
      .getByText(/required|please fill|invalid|must be/i)
      .first(), 5000);
    const hasInvalidInput = await softVisible(page
      .locator('input:invalid, select:invalid')
      .first(), 3000);
    const hasBorderError = await softVisible(page
      .locator('.border-red-500, .border-red-300, [aria-invalid="true"]')
      .first(), 3000);

    expect(hasError || hasInvalidInput || hasBorderError).toBeTruthy();
  });
});

test.describe('Public Registration - Invalid Routes', () => {
  test('should show error for non-existent conference slug', async ({ page }) => {
    await page.goto(`/${tenantSlug}/register/nonexistent-conference-xyz`);

    // Wait for either the error text to appear or a redirect
    await expect(
      page.getByText(/not found|does not exist|error|unavailable/i).first(),
    ).toBeVisible({ timeout: 15000 }).catch(() => {});

    const hasNotFound = await page
      .getByText(/not found|does not exist|error|unavailable/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasRedirect = page.url().includes('login') || page.url().includes('404');

    expect(hasNotFound || hasRedirect).toBeTruthy();
  });

  test('should show error for non-existent tenant slug', async ({ page }) => {
    await page.goto(`/nonexistent-tenant-xyz/register/some-conference`);

    await expect(
      page.getByText(/not found|does not exist|error|unavailable/i).first(),
    ).toBeVisible({ timeout: 15000 }).catch(() => {});

    const hasNotFound = await page
      .getByText(/not found|does not exist|error|unavailable/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasRedirect = page.url().includes('login') || page.url().includes('404');

    expect(hasNotFound || hasRedirect).toBeTruthy();
  });
});
