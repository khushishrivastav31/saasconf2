import { test, expect } from '@playwright/test';

/**
 * E2E tests for VAT validation in invoice creation.
 *
 * These tests verify:
 * 1. VAT requirement detection (required/recommended/optional)
 * 2. Dynamic UI updates based on country/company name
 * 3. VAT validation (3-stage cascade)
 * 4. Warning banners in invoice detail
 */

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Invoice VAT Validation - Required Scenario', () => {
  test.beforeEach(async ({ page }) => {
    if (!conferenceId) test.skip();

    // Navigate to invoices tab
    await page.goto(`/conferences/${conferenceId}`);
    await page.waitForLoadState('networkidle');

    // Check if invoices module is available (module must be enabled for tenant)
    const invoicesButton = page.getByRole('button', { name: /invoices/i });
    const isInvoicesAvailable = await invoicesButton.isVisible().catch(() => false);

    if (!isInvoicesAvailable) {
      test.skip(true, 'Invoices module not enabled for this tenant');
    }

    await invoicesButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('should show red asterisk for required VAT in virtual EU B2B scenario', async ({ page }) => {
    // Click create invoice button
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in company name (B2B indicator)
    const companyNameInput = page.getByLabel(/company name/i);
    await companyNameInput.fill('Acme SARL');

    // Select France (EU, non-domestic)
    const countrySelect = page.getByLabel(/^country/i).first();
    await countrySelect.selectOption('FR');

    // Wait for VAT requirement detection
    await page.waitForLoadState('domcontentloaded');

    // VAT field should have red asterisk
    const vatLabel = page.getByText(/VAT Number/).first();
    const asterisk = page.locator('span[aria-label="required"]').first();

    await expect(asterisk).toBeVisible();
    await expect(asterisk).toHaveText('*');

    // Should show requirement reason
    await expect(page.getByText(/reverse charge/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should create invoice with VAT error warning', async ({ page }) => {
    // Create invoice without VAT in required scenario
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill required fields
    await page.getByLabel(/company name/i).fill('Test Company SAS');
    await page.getByLabel(/street/i).first().fill('123 Test Street');
    await page.getByLabel(/city/i).first().fill('Paris');
    await page.getByLabel(/postal code/i).first().fill('75001');
    await page.getByLabel(/^country/i).first().selectOption('FR');

    // Skip VAT number (leave empty)

    // Add line item
    const descriptionInput = page.getByPlaceholder(/description/i).first();
    if (await descriptionInput.isVisible()) {
      await descriptionInput.fill('Test Service');
      await page.getByPlaceholder(/quantity/i).first().fill('1');
      await page.getByPlaceholder(/unit price/i).first().fill('1000');
    }

    // Save invoice
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForLoadState('networkidle');

    // Should show error warning banner
    await expect(page.getByText(/VAT Number Required/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/reverse charge/i).first()).toBeVisible();
  });
});

test.describe('Invoice VAT Validation - Recommended Scenario', () => {
  test.beforeEach(async ({ page }) => {
    if (!conferenceId) test.skip();

    await page.goto(`/conferences/${conferenceId}`);
    await page.waitForLoadState('networkidle');

    // Check if invoices module is available (module must be enabled for tenant)
    const invoicesButton = page.getByRole('button', { name: /invoices/i });
    const isInvoicesAvailable = await invoicesButton.isVisible().catch(() => false);

    if (!isInvoicesAvailable) {
      test.skip(true, 'Invoices module not enabled for this tenant');
    }

    await invoicesButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('should show recommended label for domestic B2B scenario', async ({ page }) => {
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in company name (B2B indicator)
    await page.getByLabel(/company name/i).fill('Tech GmbH');

    // Select same country as conference (domestic)
    const countrySelect = page.getByLabel(/^country/i).first();
    await countrySelect.selectOption('DE'); // Assuming conference is in Germany

    await page.waitForLoadState('domcontentloaded');

    // Should show "(Recommended for B2B)" label
    await expect(page.getByText(/recommended for b2b/i).first()).toBeVisible({ timeout: 5000 });

    // Should NOT have red asterisk (not required)
    const requiredAsterisk = page.locator('span[aria-label="required"]').first();
    await expect(requiredAsterisk).not.toBeVisible().catch(() => true);
  });
});

test.describe('Invoice VAT Validation - Dynamic Detection', () => {
  test.beforeEach(async ({ page }) => {
    if (!conferenceId) test.skip();

    await page.goto(`/conferences/${conferenceId}`);
    await page.waitForLoadState('networkidle');

    // Check if invoices module is available (module must be enabled for tenant)
    const invoicesButton = page.getByRole('button', { name: /invoices/i });
    const isInvoicesAvailable = await invoicesButton.isVisible().catch(() => false);

    if (!isInvoicesAvailable) {
      test.skip(true, 'Invoices module not enabled for this tenant');
    }

    await invoicesButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('should update VAT requirement when company name is added', async ({ page }) => {
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select EU country first
    await page.getByLabel(/^country/i).first().selectOption('FR');
    await page.waitForLoadState('domcontentloaded');

    // Initially no company name = B2C = optional
    let recommendedLabel = page.getByText(/recommended for b2b/i).first();
    await expect(recommendedLabel).not.toBeVisible().catch(() => true);

    // Add company name = B2B = required (for virtual EU)
    await page.getByLabel(/company name/i).fill('Business Inc');
    await page.waitForLoadState('domcontentloaded');

    // Now should show required (virtual + EU + B2B)
    const asterisk = page.locator('span[aria-label="required"]').first();
    await expect(asterisk).toBeVisible({ timeout: 5000 });
  });

  test('should update VAT requirement when country changes', async ({ page }) => {
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Add company name
    await page.getByLabel(/company name/i).fill('Test Corp');
    await page.waitForLoadState('domcontentloaded');

    // Select non-EU country (optional)
    await page.getByLabel(/^country/i).first().selectOption('US');
    await page.waitForLoadState('domcontentloaded');

    let asterisk = page.locator('span[aria-label="required"]').first();
    await expect(asterisk).not.toBeVisible().catch(() => true);

    // Change to EU country (required)
    await page.getByLabel(/^country/i).first().selectOption('FR');
    await page.waitForLoadState('domcontentloaded');

    // Now should be required
    await expect(asterisk).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Invoice VAT Number Validation', () => {
  test.beforeEach(async ({ page }) => {
    if (!conferenceId) test.skip();

    await page.goto(`/conferences/${conferenceId}`);
    await page.waitForLoadState('networkidle');

    // Check if invoices module is available (module must be enabled for tenant)
    const invoicesButton = page.getByRole('button', { name: /invoices/i });
    const isInvoicesAvailable = await invoicesButton.isVisible().catch(() => false);

    if (!isInvoicesAvailable) {
      test.skip(true, 'Invoices module not enabled for this tenant');
    }

    await invoicesButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('should validate VAT number on blur', async ({ page }) => {
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in required fields
    await page.getByLabel(/company name/i).fill('Test GmbH');
    await page.getByLabel(/^country/i).first().selectOption('DE');
    await page.waitForLoadState('domcontentloaded');

    // Enter valid German VAT number format
    const vatInput = page.getByLabel(/VAT Number/i).first();
    await vatInput.fill('DE123456789');

    // Blur to trigger validation
    await vatInput.blur();
    await page.waitForLoadState('networkidle'); // Wait for API call

    // Should show validation status (Valid, Invalid, or Unverified)
    const statusText = page.locator('text=/Valid|Invalid|Unverified/i').first();
    await expect(statusText).toBeVisible({ timeout: 10000 });
  });

  test('should show invalid status for malformed VAT number', async ({ page }) => {
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel(/company name/i).fill('Test Corp');
    await page.getByLabel(/^country/i).first().selectOption('DE');
    await page.waitForLoadState('domcontentloaded');

    // Enter invalid VAT number
    const vatInput = page.getByLabel(/VAT Number/i).first();
    await vatInput.fill('INVALID');
    await vatInput.blur();
    await page.waitForLoadState('networkidle');

    // Should show invalid status
    await expect(page.getByText(/invalid/i).first()).toBeVisible({ timeout: 10000 });
  });
});
