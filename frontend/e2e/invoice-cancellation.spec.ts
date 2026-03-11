import { test, expect } from '@playwright/test';

/**
 * E2E tests for invoice cancellation workflow.
 *
 * These tests verify:
 * 1. Basic invoice cancellation (creates credit note)
 * 2. Enhanced cancellation with registration cancellation option
 */

const conferenceId = process.env.E2E_CONFERENCE_ID;

test.describe('Invoice Cancellation Workflow', () => {
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

  test('should cancel invoice and create credit note', async ({ page }) => {
    // Find a sent invoice to cancel
    const invoiceRow = page.locator('tr').filter({ hasText: /sent|paid/i }).first();
    const isInvoiceAvailable = await invoiceRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isInvoiceAvailable) {
      test.skip(true, 'No sent/paid invoices available for testing');
    }

    await invoiceRow.click();
    await expect(page.getByRole('button', { name: /cancel.*invoice/i }).first()).toBeVisible();

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: /cancel.*invoice/i }).first();
    const isCancelAvailable = await cancelButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isCancelAvailable) {
      test.skip(true, 'Cancel Invoice button not visible');
    }

    await cancelButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill cancellation reason
    await page.getByPlaceholder(/reason.*cancel/i).fill('Customer requested refund');

    // Don't check "Cancel all registrations" for basic test
    const cancelRegsCheckbox = page.getByLabel(/cancel.*all.*registrations/i);
    const isCheckboxVisible = await cancelRegsCheckbox.isVisible().catch(() => false);
    if (isCheckboxVisible) {
      // Make sure it's NOT checked for basic cancellation
      const isChecked = await cancelRegsCheckbox.isChecked();
      if (isChecked) {
        await cancelRegsCheckbox.uncheck();
      }
    }

    // Submit cancellation
    await page.getByRole('button', { name: /confirm.*cancel/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify success message
    await expect(
      page.getByText(/invoice cancelled/i).or(page.getByText(/cancelled successfully/i))
    ).toBeVisible({ timeout: 5000 });

    // Verify invoice status changed to cancelled
    await expect(page.getByText(/cancelled/i)).toBeVisible({ timeout: 3000 });
  });

  test('should show registration cancellation option when invoice has registrations', async ({ page }) => {
    // Find an invoice (sent or paid)
    const invoiceRow = page.locator('tr').filter({ hasText: /sent|paid/i }).first();
    const isInvoiceAvailable = await invoiceRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isInvoiceAvailable) {
      test.skip(true, 'No sent/paid invoices available for testing');
    }

    await invoiceRow.click();
    await expect(page.getByRole('button', { name: /cancel.*invoice/i }).first()).toBeVisible();

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: /cancel.*invoice/i }).first();
    const isCancelAvailable = await cancelButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isCancelAvailable) {
      test.skip(true, 'Cancel Invoice button not visible');
    }

    await cancelButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Check if registration cancellation checkbox is available
    const cancelRegsCheckbox = page.getByLabel(/cancel.*all.*registrations/i);
    const isCheckboxVisible = await cancelRegsCheckbox.isVisible().catch(() => false);

    if (isCheckboxVisible) {
      // Checkbox should be visible and unchecked by default
      await expect(cancelRegsCheckbox).toBeVisible();
      expect(await cancelRegsCheckbox.isChecked()).toBe(false);

      // Cancellation message field should appear when checked
      await cancelRegsCheckbox.check();

      const messageField = page.getByPlaceholder(/message.*attendees/i);
      await expect(messageField).toBeVisible({ timeout: 2000 });
    } else {
      // No registrations linked - checkbox not shown (this is also valid)
      test.skip(true, 'Invoice has no registrations - checkbox not available');
    }
  });

  test('should require cancellation reason', async ({ page }) => {
    // Find a sent invoice to cancel
    const invoiceRow = page.locator('tr').filter({ hasText: /sent|paid/i }).first();
    const isInvoiceAvailable = await invoiceRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isInvoiceAvailable) {
      test.skip(true, 'No sent/paid invoices available for testing');
    }

    await invoiceRow.click();
    await expect(page.getByRole('button', { name: /cancel.*invoice/i }).first()).toBeVisible();

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: /cancel.*invoice/i }).first();
    const isCancelAvailable = await cancelButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isCancelAvailable) {
      test.skip(true, 'Cancel Invoice button not visible');
    }

    await cancelButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Don't fill reason - submit button should be disabled
    const submitButton = page.getByRole('button', { name: /confirm.*cancel/i });
    await expect(submitButton).toBeDisabled();
  });

  test('should show refund information for paid credit card invoices', async ({ page }) => {
    // Find a paid invoice
    const paidInvoice = page.locator('tr').filter({ hasText: /paid/i }).first();
    const isPaidInvoiceAvailable = await paidInvoice.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isPaidInvoiceAvailable) {
      test.skip(true, 'No paid invoices available for testing');
    }

    await paidInvoice.click();
    await expect(page.getByRole('button', { name: /cancel.*invoice/i }).first()).toBeVisible();

    // Check if it's a credit card invoice by looking for payment details
    const isCreditCard = await page.getByText(/credit.*card|stripe|payment.*link/i).isVisible().catch(() => false);

    if (!isCreditCard) {
      test.skip(true, 'Not a credit card invoice');
    }

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: /cancel.*invoice/i }).first();
    await cancelButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Should show refund information
    await expect(
      page.getByText(/refund/i).or(page.getByText(/full.*refund/i))
    ).toBeVisible({ timeout: 3000 });
  });
});
