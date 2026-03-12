import { test, expect } from '@playwright/test';

import { softVisible } from './helpers/navigation';
/**
 * E2E tests for invoice replacement workflow.
 *
 * These tests verify the full user journey for replacing an invoice
 * when the buyer provided incorrect billing information.
 */

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Invoice Replacement Workflow', () => {
  test.beforeEach(async ({ page }) => {
    if (!conferenceId) test.skip();

    // Navigate to invoices tab
    await page.goto(`/conferences/${conferenceId}`);
    await page.waitForLoadState('networkidle');

    // Check if invoices module is available
    const invoicesButton = page.getByRole('button', { name: /invoices/i });
    const isInvoicesAvailable = await invoicesButton.isVisible().catch(() => false);

    if (!isInvoicesAvailable) {
      test.skip(true, 'Invoices module not enabled for this tenant');
    }

    await invoicesButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('should replace invoice with corrected billing information', async ({ page }) => {
    // Create a new invoice
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in invoice details
    const timestamp = Date.now();
    await page.getByLabel(/company.*name/i).fill(`Test Company ${timestamp}`);
    await page.getByLabel(/email/i).first().fill(`test${timestamp}@example.com`);
    await page.getByLabel(/street/i).fill('123 Test Street');
    await page.getByLabel(/city/i).fill('Berlin');
    await page.getByLabel(/postal code/i).fill('10115');
    await page.getByLabel(/^country/i).first().selectOption('DE');
    await page.getByLabel(/vat.*number/i).fill('DE123456789');

    // Add a line item
    await page.getByRole('button', { name: /add.*item/i }).click();
    await expect(page.getByLabel(/description/i).first()).toBeVisible();
    await page.getByLabel(/description/i).first().fill('Conference Ticket');
    await page.getByLabel(/quantity/i).first().fill('1');
    await page.getByLabel(/unit.*price/i).first().fill('1000');

    // Save draft
    await page.getByRole('button', { name: /save.*draft/i }).click();
    await page.waitForLoadState('networkidle');

    // Send invoice
    const sendButton = page.getByRole('button', { name: /^send$/i }).first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Now replace the invoice
    const replaceButton = page.getByRole('button', { name: /replace.*invoice/i }).first();
    const isReplaceAvailable = await softVisible(replaceButton, 2000);

    if (!isReplaceAvailable) {
      test.skip(true, 'Replace Invoice button not visible (invoice may not be sent)');
    }

    await replaceButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in replacement reason
    await page.getByPlaceholder(/wrong company name/i).fill('Company name was incorrect');

    // Change company name
    const companyNameInput = page.getByLabel(/company.*name/i);
    await companyNameInput.clear();
    await companyNameInput.fill(`Corrected Company ${timestamp}`);

    // Change VAT number
    const vatInput = page.getByLabel(/vat.*number/i);
    await vatInput.clear();
    await vatInput.fill('DE999888777');

    // Submit replacement
    await page.getByRole('button', { name: /replace.*invoice.*create.*credit/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify success message
    await expect(
      page.getByText(/invoice replaced successfully/i).or(page.getByText(/replaced/i))
    ).toBeVisible({ timeout: 5000 });

    // Verify we can see the new invoice in the list
    await expect(page.getByText(`Corrected Company ${timestamp}`)).toBeVisible({ timeout: 3000 });
  });

  test('should show validation error when no fields changed', async ({ page }) => {
    // Find a sent invoice to replace
    const invoiceRow = page.locator('tr').filter({ hasText: /sent|paid/i }).first();
    const isInvoiceAvailable = await softVisible(invoiceRow, 3000);

    if (!isInvoiceAvailable) {
      test.skip(true, 'No sent/paid invoices available for testing');
    }

    await invoiceRow.click();
    await expect(page.getByRole('button', { name: /replace.*invoice/i }).first()).toBeVisible();

    // Click replace button
    const replaceButton = page.getByRole('button', { name: /replace.*invoice/i }).first();
    const isReplaceAvailable = await softVisible(replaceButton, 2000);

    if (!isReplaceAvailable) {
      test.skip(true, 'Replace Invoice button not visible');
    }

    await replaceButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill reason but don't change any fields
    await page.getByPlaceholder(/wrong company name/i).fill('Test reason');

    // Should show warning
    await expect(
      page.getByText(/at least one billing field must be different/i)
    ).toBeVisible({ timeout: 3000 });

    // Submit button should be disabled
    const submitButton = page.getByRole('button', { name: /replace.*invoice.*create.*credit/i });
    await expect(submitButton).toBeDisabled();
  });

  test('should preserve paid status when replacing paid invoice', async ({ page }) => {
    // This test would require marking an invoice as paid first
    // For now, we'll skip if no paid invoices are available
    const paidInvoice = page.locator('tr').filter({ hasText: /paid/i }).first();
    const isPaidInvoiceAvailable = await softVisible(paidInvoice, 3000);

    if (!isPaidInvoiceAvailable) {
      test.skip(true, 'No paid invoices available for testing');
    }

    await paidInvoice.click();
    await expect(page.getByRole('button', { name: /replace.*invoice/i }).first()).toBeVisible();

    // Click replace button
    const replaceButton = page.getByRole('button', { name: /replace.*invoice/i }).first();
    await replaceButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Verify status inheritance message
    await expect(
      page.getByText(/new invoice will inherit.*paid.*status/i)
    ).toBeVisible({ timeout: 3000 });
  });
});
